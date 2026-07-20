/**
 * Username-only "accounts" — no email, no phone, no password prompt shown
 * to the user. Underneath, this still uses real Supabase Auth (so row-level
 * security and sessions work properly) by mapping each username to a
 * synthetic email + a fixed, non-secret password. This means: the username
 * itself is the access key — anyone who knows it can log in as that user.
 * That tradeoff was chosen on purpose (no password prompt at all).
 */

import { supabase } from "./supabase-client.js";

const USERNAME_KEY = "mednotebook-username";

function cleanUsername(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function credentialsFor(username) {
  return {
    email: `${username}@mednotebook.local`,
    password: `mnb-fixed-${username}-key-v1`,
  };
}

export async function loginOrCreate(rawUsername) {
  const username = cleanUsername(rawUsername);
  if (!username) {
    throw new Error("Enter a username using letters, numbers, or underscore.");
  }
  const { email, password } = credentialsFor(username);

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error) {
    localStorage.setItem(USERNAME_KEY, username);
    return username;
  }

  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) {
    throw new Error("Couldn't set up that username. Please try again.");
  }

  const userId = signUp.data.user?.id;
  if (userId) {
    await supabase.from("profiles").upsert({ id: userId, username });
  }
  localStorage.setItem(USERNAME_KEY, username);
  return username;
}

export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    return localStorage.getItem(USERNAME_KEY) || "you";
  }
  return null;
}

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem(USERNAME_KEY);
}
