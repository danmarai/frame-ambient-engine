"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function login(formData: FormData) {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "Password is required" };
  }

  const passwordHash = process.env.APP_PASSWORD_HASH;

  if (!passwordHash) {
    return { error: "Server configuration error: no password hash set" };
  }

  const isValid = await compare(password, passwordHash);

  if (!isValid) {
    return { error: "Invalid password" };
  }

  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();

  redirect("/dashboard");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
