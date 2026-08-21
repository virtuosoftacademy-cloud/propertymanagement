import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
    if (!auth === false) {
        redirect("/landing");
    }
    redirect("/dashboard");
}