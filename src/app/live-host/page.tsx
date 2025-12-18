import { redirect } from "next/navigation";

export default function LiveHostPage() {
  redirect("/live?host=1");
}
