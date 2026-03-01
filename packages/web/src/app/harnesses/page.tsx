import { redirect } from "next/navigation";

export default function HarnessesPage() {
  redirect("/leaderboard?tab=harnesses");
}
