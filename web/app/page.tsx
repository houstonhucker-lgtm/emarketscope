import { redirect } from "next/navigation";

// Calendar is the default landing tab -- spec: "expected to be
// referenced most frequently of anything in the app."
export default function RootPage() {
  redirect("/calendar");
}
