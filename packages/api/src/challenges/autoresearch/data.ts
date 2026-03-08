/**
 * Data generation for the autoresearch challenge.
 *
 * The seed selects which text corpus the training service uses.
 * The workspace always contains the same baseline train.py and prepare.py
 * (the service handles corpus selection via the SEED env var).
 */

// ── Corpus metadata ──

const CORPUS_NAMES = ["shakespeare", "python", "wikipedia", "scientific", "legal"] as const;

const CORPUS_DESCRIPTIONS: Record<string, string> = {
  shakespeare: "Shakespeare's complete works — repetitive patterns, archaic vocabulary",
  python: "Python source code — low entropy per byte, structured syntax",
  wikipedia: "Wikipedia-style articles — mixed topics, balanced entropy",
  scientific: "Scientific abstracts — technical vocabulary, higher entropy",
  legal: "Legal/financial documents — formulaic structure, domain-specific patterns",
};

// Baseline val_bpb per corpus (calibrated empirically from baseline_train.py)
// These are the val_bpb achieved by the unmodified baseline script
const BASELINE_VAL_BPB: Record<string, number> = {
  shakespeare: 3.25,
  python: 2.80,
  wikipedia: 3.40,
  scientific: 3.55,
  legal: 3.30,
};

// Floor val_bpb per corpus (best realistically achievable at this scale/budget)
// An optimized ~250K param model with modern arch achieves roughly these values
const FLOOR_VAL_BPB: Record<string, number> = {
  shakespeare: 2.20,
  python: 1.80,
  wikipedia: 2.40,
  scientific: 2.60,
  legal: 2.30,
};

// ── Baseline train.py source ──
// This is embedded here so generateWorkspace can return it without
// reading from the filesystem (challenge modules must be self-contained).

const BASELINE_TRAIN_PY = `"""
Baseline training script for autoresearch challenge.

This trains a small GPT language model on byte-level data and reports val_bpb.
It WORKS but is deliberately unoptimized — there's significant room for improvement.

Modify this file to achieve the lowest possible val_bpb within TIME_BUDGET.
"""

import os
import sys
import json
import time
import math

import torch
import torch.nn as nn
import torch.nn.functional as F

from prepare import (
    MAX_SEQ_LEN,
    TIME_BUDGET,
    VOCAB_SIZE,
    ByteTokenizer,
    make_dataloader,
    evaluate_bpb,
)

# ---------------------------------------------------------------------------
# Hyperparameters
# ---------------------------------------------------------------------------

# Model architecture
d_model = 128             # embedding dimension
n_heads = 4               # number of attention heads
n_layers = 4              # number of transformer layers
d_ff = 512                # feed-forward intermediate dimension
dropout = 0.1             # dropout rate

# Training
batch_size = 16           # batch size
learning_rate = 1e-3      # learning rate (constant, no schedule)
weight_decay = 0.0        # no weight decay (using Adam, not AdamW)

# Derived
head_dim = d_model // n_heads
device = "cpu"

# Reproducibility
seed = int(os.environ.get("TORCH_SEED", "42"))
torch.manual_seed(seed)

# ---------------------------------------------------------------------------
# Model: Small GPT
# ---------------------------------------------------------------------------


class Attention(nn.Module):
    """Multi-head self-attention with causal mask."""

    def __init__(self):
        super().__init__()
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        B, T, C = x.shape
        qkv = self.qkv(x)
        q, k, v = qkv.chunk(3, dim=-1)

        # Reshape for multi-head attention
        q = q.view(B, T, n_heads, head_dim).transpose(1, 2)  # (B, H, T, D)
        k = k.view(B, T, n_heads, head_dim).transpose(1, 2)
        v = v.view(B, T, n_heads, head_dim).transpose(1, 2)

        # Scaled dot-product attention with causal mask
        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(head_dim))
        causal_mask = torch.triu(
            torch.ones(T, T, device=x.device, dtype=torch.bool), diagonal=1
        )
        att = att.masked_fill(causal_mask, float("-inf"))
        att = F.softmax(att, dim=-1)
        att = self.dropout(att)

        out = att @ v  # (B, H, T, D)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        out = self.out_proj(out)
        return out


class MLP(nn.Module):
    """Feed-forward network with ReLU activation."""

    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(d_model, d_ff)
        self.fc2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        # NOTE: Using ReLU here. GELU or SwiGLU would likely be better.
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x


class TransformerBlock(nn.Module):
    """Single transformer block with post-LayerNorm."""

    def __init__(self):
        super().__init__()
        self.attn = Attention()
        self.mlp = MLP()
        # NOTE: Post-LayerNorm (norm after residual add).
        # Pre-LayerNorm (norm before attention/MLP) is generally more stable.
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)

    def forward(self, x):
        # Post-norm: residual -> norm
        x = self.ln1(x + self.attn(x))
        x = self.ln2(x + self.mlp(x))
        return x


class GPT(nn.Module):
    """Small GPT language model."""

    def __init__(self):
        super().__init__()
        # Token embedding
        self.tok_emb = nn.Embedding(VOCAB_SIZE, d_model)
        # Learned positional embedding
        self.pos_emb = nn.Embedding(MAX_SEQ_LEN, d_model)
        # Transformer blocks
        self.blocks = nn.ModuleList([TransformerBlock() for _ in range(n_layers)])
        # Final layer norm
        self.ln_f = nn.LayerNorm(d_model)
        # Output head (separate from embedding — no weight tying)
        # NOTE: Weight tying (self.head.weight = self.tok_emb.weight) would
        # reduce parameters and often improves performance at this scale.
        self.head = nn.Linear(d_model, VOCAB_SIZE)

        # Initialize weights
        self._init_weights()

    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, x, targets=None):
        """
        Args:
            x: input token IDs, shape (B, T)
            targets: target token IDs, shape (B, T). If provided, returns loss.
        Returns:
            If targets is None: logits of shape (B, T, VOCAB_SIZE)
            If targets is provided: scalar cross-entropy loss
        """
        B, T = x.shape
        assert T <= MAX_SEQ_LEN, f"Sequence length {T} exceeds MAX_SEQ_LEN {MAX_SEQ_LEN}"

        # Embeddings
        tok = self.tok_emb(x)  # (B, T, d_model)
        pos = self.pos_emb(torch.arange(T, device=x.device))  # (T, d_model)
        x = tok + pos

        # Transformer blocks
        for block in self.blocks:
            x = block(x)

        # Output
        x = self.ln_f(x)
        logits = self.head(x)  # (B, T, VOCAB_SIZE)

        if targets is not None:
            loss = F.cross_entropy(logits.reshape(-1, VOCAB_SIZE), targets.reshape(-1))
            return loss

        return logits


# ---------------------------------------------------------------------------
# Training Loop
# ---------------------------------------------------------------------------

def train():
    """Train the model for TIME_BUDGET seconds and report val_bpb."""

    # Build model
    model = GPT().to(device)
    n_params = sum(p.numel() for p in model.parameters())

    # Optimizer — plain Adam, single param group, no weight decay separation
    # NOTE: AdamW with proper weight decay (excluding biases and LayerNorm)
    # would likely improve results.
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=learning_rate,
        betas=(0.9, 0.999),  # NOTE: beta2=0.95 is often better for transformers
    )

    # No learning rate schedule
    # NOTE: Cosine decay with warmup would likely improve results significantly.

    # Data
    train_loader = make_dataloader(batch_size, MAX_SEQ_LEN, "train", device)

    # Training
    model.train()
    start_time = time.time()
    step = 0
    total_loss = 0.0
    log_interval = 50

    print(f"Model: {n_params:,} parameters", file=sys.stderr)
    print(f"Config: d_model={d_model}, n_heads={n_heads}, n_layers={n_layers}, d_ff={d_ff}", file=sys.stderr)
    print(f"Training for {TIME_BUDGET}s with batch_size={batch_size}, lr={learning_rate}", file=sys.stderr)
    print(file=sys.stderr)

    while True:
        elapsed = time.time() - start_time
        if elapsed >= TIME_BUDGET:
            break

        # Get batch
        x, y = next(train_loader)

        # Forward pass
        loss = model(x, y)

        # Backward pass
        optimizer.zero_grad()
        loss.backward()

        # NOTE: No gradient clipping. Adding torch.nn.utils.clip_grad_norm_
        # would help prevent occasional loss spikes.
        optimizer.step()

        total_loss += loss.item()
        step += 1

        if step % log_interval == 0:
            avg_loss = total_loss / log_interval
            elapsed = time.time() - start_time
            tokens_per_sec = (step * batch_size * MAX_SEQ_LEN) / elapsed
            print(
                f"step {step:5d} | loss {avg_loss:.4f} | "
                f"lr {learning_rate:.2e} | "
                f"tok/s {tokens_per_sec:.0f} | "
                f"elapsed {elapsed:.1f}s",
                file=sys.stderr,
            )
            total_loss = 0.0

    training_time = time.time() - start_time

    # Evaluate
    print(f"\\nEvaluating val_bpb...", file=sys.stderr)
    eval_start = time.time()
    val_bpb = evaluate_bpb(model, batch_size, device)
    eval_time = time.time() - eval_start

    print(f"val_bpb: {val_bpb:.6f} (eval took {eval_time:.1f}s)", file=sys.stderr)

    # Output results as JSON on stdout (parsed by the training service)
    results = {
        "val_bpb": round(val_bpb, 6),
        "train_loss": round(loss.item(), 6) if step > 0 else None,
        "total_steps": step,
        "training_time_secs": round(training_time, 2),
        "num_params_M": round(n_params / 1e6, 4),
        "d_model": d_model,
        "n_layers": n_layers,
        "n_heads": n_heads,
        "d_ff": d_ff,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "device": device,
    }
    print(json.dumps(results))


if __name__ == "__main__":
    train()
`;

// ── Prepare.py source (embedded for workspace generation) ──

const PREPARE_PY_SOURCE = `"""
Fixed evaluation harness for autoresearch challenge.

This file is READ-ONLY. It provides:
  - Constants (context length, time budget, vocab size)
  - Byte-level tokenizer
  - Data loading with BOS-aligned packing
  - evaluate_bpb() — the ground truth metric

Agents import from this file in their train.py but CANNOT modify it.
The training service always uses the bundled copy.
"""

import os
import math
import torch

# ---------------------------------------------------------------------------
# Constants (fixed, do not modify)
# ---------------------------------------------------------------------------

MAX_SEQ_LEN = 256        # context length (tokens = bytes for byte-level)
TIME_BUDGET = 180        # training time budget in seconds (3 minutes)
EVAL_TOKENS = 2 * 65536  # ~131K tokens for validation eval
VOCAB_SIZE = 256         # byte-level tokenizer: one token per byte value
BOS_TOKEN = 0            # use null byte as BOS marker

# ---------------------------------------------------------------------------
# Data directory
# ---------------------------------------------------------------------------

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

# ---------------------------------------------------------------------------
# Byte-level tokenizer
# ---------------------------------------------------------------------------

class ByteTokenizer:
    """
    Trivial byte-level tokenizer. Every byte value (0-255) is a token.
    No BPE, no merging — just raw bytes.
    """

    def __init__(self):
        self.vocab_size = VOCAB_SIZE
        self.bos_token_id = BOS_TOKEN

    def encode(self, text: str) -> list[int]:
        return list(text.encode("utf-8"))

    def decode(self, ids: list[int]) -> str:
        return bytes(ids).decode("utf-8", errors="replace")

    def get_vocab_size(self) -> int:
        return self.vocab_size

    def get_bos_token_id(self) -> int:
        return self.bos_token_id


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_shard(filepath: str) -> torch.Tensor:
    with open(filepath, "rb") as f:
        data = f.read()
    return torch.frombuffer(bytearray(data), dtype=torch.uint8).long()


def _get_data_files(split: str) -> list[str]:
    prefix = f"{split}"
    files = [
        os.path.join(DATA_DIR, f)
        for f in sorted(os.listdir(DATA_DIR))
        if f.startswith(prefix) and f.endswith(".bin")
    ]
    assert len(files) > 0, f"No data files found for split '{split}' in {DATA_DIR}"
    return files


def make_dataloader(B: int, T: int, split: str = "train", device: str = "cpu"):
    """
    Infinite iterator yielding (inputs, targets) batches.
    BOS-aligned packing, 100% utilization (no padding).
    """
    assert split in ("train", "val")
    data_files = _get_data_files(split)
    row_len = T + 1
    all_data = torch.cat([_load_shard(f) for f in data_files])
    n_tokens = len(all_data)
    pos = 0

    while True:
        batch = torch.empty((B, row_len), dtype=torch.long)
        for row in range(B):
            batch[row, 0] = BOS_TOKEN
            remaining = row_len - 1
            if pos + remaining > n_tokens:
                first_part = n_tokens - pos
                batch[row, 1:1 + first_part] = all_data[pos:pos + first_part]
                pos = 0
                second_part = remaining - first_part
                batch[row, 1 + first_part:] = all_data[pos:pos + second_part]
                pos = second_part
            else:
                batch[row, 1:] = all_data[pos:pos + remaining]
                pos += remaining

        inputs = batch[:, :-1].to(device)
        targets = batch[:, 1:].to(device)
        yield inputs, targets


# ---------------------------------------------------------------------------
# Evaluation (DO NOT CHANGE — this is the fixed metric)
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate_bpb(model, B: int, device: str = "cpu") -> float:
    """
    Bits per byte (BPB).

    For byte-level tokenization: BPB = mean_cross_entropy_loss / ln(2).
    Every token is exactly one byte, so no token_bytes mapping is needed.
    """
    model.eval()
    val_loader = make_dataloader(B, MAX_SEQ_LEN, "val", device)
    steps = max(1, EVAL_TOKENS // (B * MAX_SEQ_LEN))

    total_loss = 0.0
    total_tokens = 0

    for _ in range(steps):
        x, y = next(val_loader)
        loss = model(x, y)
        loss_val = loss.item() if hasattr(loss, 'item') else float(loss)
        total_loss += loss_val * (B * MAX_SEQ_LEN)
        total_tokens += B * MAX_SEQ_LEN

    mean_loss_nats = total_loss / total_tokens
    bpb = mean_loss_nats / math.log(2)

    model.train()
    return bpb
`;

// ── Data generation ──

export interface AutoresearchData {
  objective: string;
  groundTruth: {
    corpusName: string;
    corpusIndex: number;
    baselineValBpb: number;
    floorValBpb: number;
    seed: number;
  };
  workspaceFiles: Record<string, string>;
}

export function generateAutoresearchData(seed: number): AutoresearchData {
  const corpusIndex = seed % CORPUS_NAMES.length;
  const corpusName = CORPUS_NAMES[corpusIndex];
  const baselineValBpb = BASELINE_VAL_BPB[corpusName];
  const floorValBpb = FLOOR_VAL_BPB[corpusName];

  const objective =
    `Optimize a GPT language model training script to achieve the lowest ` +
    `possible validation bits per byte (val_bpb). You have a training service ` +
    `that runs your modified code on the "${corpusName}" corpus. ` +
    `The baseline achieves val_bpb ≈ ${baselineValBpb.toFixed(2)}. ` +
    `You have 15 runs and 45 minutes. Lower val_bpb = better score.`;

  return {
    objective,
    groundTruth: {
      corpusName,
      corpusIndex,
      baselineValBpb,
      floorValBpb,
      seed,
    },
    workspaceFiles: {
      "train.py": BASELINE_TRAIN_PY,
      "prepare.py": PREPARE_PY_SOURCE,
    },
  };
}
