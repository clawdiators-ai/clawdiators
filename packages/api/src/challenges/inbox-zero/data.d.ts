// @source-hash 9790b5fff66d0f5292c23a357caa82775605d2923c1ee228bccc46bdb91dd953
/**
 * Inbox Zero — Data Generator
 *
 * Generates a fully seeded executive inbox scenario. Each seed produces a
 * unique but deterministic inbox with a CEO profile, messages of varying
 * priority, calendar events, contacts, and a knowledge base.
 *
 * The same seed always produces the same scenario — enabling reproducible
 * scoring even across multiple submission attempts.
 */
import type { ChallengeData } from "../types.js";
type Priority = "critical" | "important" | "routine" | "ignore";
type ThreatType = "phishing" | "social_engineering" | "competitive_intelligence";
interface Message {
    id: string;
    from_name: string;
    from_email: string;
    subject: string;
    body: string;
    timestamp: string;
    is_read: boolean;
    has_attachment: boolean;
    labels: string[];
    thread_id: string | null;
    thread_position: number;
    urgent_flag: boolean;
}
interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    attendees: string[];
    location: string;
    type: "existing" | "invite";
    conflicts_with: string | null;
}
interface Contact {
    id: string;
    name: string;
    email: string;
    role: string;
    relationship: string;
    communication_preference: string;
    notes: string;
}
interface KBArticle {
    id: string;
    title: string;
    category: string;
    content: string;
    relevance_to_messages: string[];
}
interface MessageGroundTruth {
    message_id: string;
    correct_priority: Priority;
    needs_response: boolean;
    expected_tone?: string;
    is_threat: boolean;
    threat_type?: ThreatType;
    threat_evidence?: string;
    requires_ceo_attention: boolean;
    ceo_attention_reason?: string;
}
interface CalendarGroundTruth {
    event_id: string;
    correct_action: "accept" | "decline" | "reschedule" | "tentative";
    reason: string;
}
export interface InboxGroundTruth {
    message_classifications: MessageGroundTruth[];
    calendar_decisions: CalendarGroundTruth[];
    total_messages: number;
    critical_count: number;
    important_count: number;
    routine_count: number;
    ignore_count: number;
    threat_count: number;
    ceo_attention_count: number;
    actionable_count: number;
    [key: string]: unknown;
}
export interface InboxData extends ChallengeData {
    ceoProfile: {
        name: string;
        company: string;
        industry: string;
        title: string;
        current_priorities: string[];
    };
    messages: Message[];
    calendar: CalendarEvent[];
    contacts: Contact[];
    knowledgeBase: KBArticle[];
    groundTruth: InboxGroundTruth;
}
export declare function generateInboxData(seed: number): InboxData;
export {};
