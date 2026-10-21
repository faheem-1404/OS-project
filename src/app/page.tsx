import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  DoorOpen,
  GraduationCap,
  KeyRound,
  QrCode,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Ambient, Logo } from "@/components/ui";
import { store } from "@/lib/server/store";

export default async function LandingPage() {
  const transport = store().transport;

  return (
    <>
      <Ambient />
      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-6 sm:px-8">
        {/* Navigation Bar */}
        <header className="flex items-center justify-between border-b border-slate-200/80 pb-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">
              {transport === "supabase" ? "Supabase Cloud" : "Local Engine"}
            </span>
            <Link
              href="/host"
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              Host Console
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-14 text-center sm:pt-20">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-700/15">
            <GraduationCap className="h-4 w-4" />
            Interactive University Access Control Simulation
          </div>

          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Test campus doors.
            <span className="mt-1 block text-blue-600">
              Understand Role-Based Access Control.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-slate-600 sm:text-lg">
            CampusLock turns access control into a hands-on classroom lab. Students scan the QR code on their phones, get assigned campus credentials, and test security rules against physical doors and restricted facilities.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/host"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 font-bold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
            >
              Create Classroom Session
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/join"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-7 py-3.5 font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50 sm:w-auto"
            >
              Enter Room Code
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-600" /> Up to 60+ students
            </span>
            <span className="inline-flex items-center gap-1.5">
              <QrCode className="h-4 w-4 text-blue-600" /> Instant camera scan join
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> 10 real campus roles
            </span>
          </div>
        </section>

        {/* How It Works Grid */}
        <section className="mt-20">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">How It Works in Class</h2>
            <p className="mt-1.5 text-sm text-slate-600">Built for instructors and students to use together effortlessly.</p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                01
              </div>
              <h3 className="mt-4 font-bold text-slate-900 text-base">Host creates room</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Instructor clicks Create Room to project a room code and QR code onto the lecture screen.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                02
              </div>
              <h3 className="mt-4 font-bold text-slate-900 text-base">Students scan & join</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Students scan on their phone. The host reviews and admits them to issue their digital badge.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                03
              </div>
              <h3 className="mt-4 font-bold text-slate-900 text-base">Tap doors & test</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Students swipe into the Library, Research Lab, or Server Room to observe real-time access decisions.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                04
              </div>
              <h3 className="mt-4 font-bold text-slate-900 text-base">Solve dilemmas</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Vote on real security scenarios (least privilege, revocation) and compete on the live leaderboard.
              </p>
            </div>
          </div>
        </section>

        {/* Core Principles */}
        <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-8 shadow-2xs">
          <h2 className="text-xl font-bold text-slate-900">Key Security Concepts Covered</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <KeyRound className="h-4 w-4 text-blue-600" />
                Authentication ≠ Authorization
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Knowing who you are (a valid student ID) is completely distinct from what you are allowed to access (the university server room).
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <DoorOpen className="h-4 w-4 text-blue-600" />
                Principle of Least Privilege
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Users receive only the clearance required for their specific role. Over-broad permissions create vulnerabilities.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <BookOpen className="h-4 w-4 text-blue-600" />
                Access Lifecycle & Revocation
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                When credentials expire or roles change, access is immediately revoked. Security is continuous, not a one-time check.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}