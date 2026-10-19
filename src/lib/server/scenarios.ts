import type { Decision } from "@/lib/types";

/**
 * The answer key. SERVER-ONLY module — importing this from a client
 * component would leak every correct answer. When Supabase is configured
 * the key is read from `public.scenarios` instead; this file is the
 * single source of truth for local/demo mode.
 */
export interface ScenarioRecord extends PublicScenarioFields {
  id: number;
  correctDecision: Decision;
  explanation: string;
  principle: string;
}

interface PublicScenarioFields {
  roundIndex: number;
  title: string;
  description: string;
  resourceType: string;
  requesterRole: string;
  accessRequest: string;
}

export const SCENARIOS: ScenarioRecord[] = [
  {
    id: 1,
    roundIndex: 1,
    title: "Unauthorized Entry to the Server Room",
    description:
      "A student presents a valid, unexpired university ID card at the server room door at 02:14. The card reader confirms the card is genuine and the account is active. The student is not an IT administrator and has no assignment that requires server room access.",
    resourceType: "Physical secure zone — Server Room",
    requesterRole: "Undergraduate Student",
    accessRequest: "Enter the server room",
    correctDecision: "DENY",
    explanation:
      "The credential was authenticated, not authorized. A valid identity proves who you are — it says nothing about which doors you are allowed through. The access policy grants the server room only to the IT Administrator role, so the request fails even though the card is real and active.",
    principle:
      "Having a valid identity does not mean having permission to access every resource.",
  },
  {
    id: 2,
    roundIndex: 2,
    title: "Temporary Examiner — Time-Boxed Access",
    description:
      "A visiting examiner from a partner university is scheduled to moderate a paper in Examination Hall B, from 09:00 to 13:00 today. An access grant was issued to their visitor account for Examination Hall B only, with an explicit end time of 13:00. It is now 11:20 and the grant is still within its window.",
    resourceType: "Examination venue — Hall B",
    requesterRole: "Visiting Examiner",
    accessRequest: "Enter the designated examination room while the grant is valid",
    correctDecision: "APPROVE",
    explanation:
      "The grant is real, it is scoped to exactly one room, and it has not expired. The system has already done the hard work: it issued narrow, time-bound access instead of a permanent one. Approving here is correct precisely because the access is temporary, scoped, and still inside its validity window — after 13:00 the same request must be denied.",
    principle: "Temporary access should be scoped and time-bound.",
  },
  {
    id: 3,
    roundIndex: 3,
    title: "A Former Student Still Marked Active",
    description:
      "A student who graduated two semesters ago approaches the library after hours. The system still shows their ID as ACTIVE and their affiliation record was never closed. Their university enrolment has ended and no new authorization has been established. Their stated reason is that they \"just need to return a book\".",
    resourceType: "Library — after-hours restricted wing",
    requesterRole: "Former Student (graduated, affiliation ended)",
    accessRequest: "Enter the library after hours",
    correctDecision: "DENY",
    explanation:
      "Stale data is the danger here. The card still authenticates, but the relationship it stood for no longer exists. Access decisions must be driven by current authorization, not by whatever the directory last knew. Until HR and the identity provider independently close the record and a new authorization is granted, this person is a stranger at the door.",
    principle: "Access must be updated when a person leaves the institution.",
  },
  {
    id: 4,
    roundIndex: 4,
    title: "Professor Requesting Write Access to Grades",
    description:
      "A Professor of Applied Mathematics requests write access to the gradebook for two courses she currently teaches: MATH-310 and MATH-412. The access request asks for create, edit and publish permissions on both gradebooks, and nothing else.",
    resourceType: "Academic record — Gradebook",
    requesterRole: "Professor",
    accessRequest: "Edit and publish grades for assigned courses only",
    correctDecision: "APPROVE",
    explanation:
      "This is least privilege working correctly. The professor holds the role, the two courses are genuinely assigned to her this term, and the request covers exactly what her job requires and nothing more. Note that the grant is scoped to two specific courses — the same professor asking to edit a gradebook she does not teach must be denied.",
    principle:
      "Least privilege and need-to-know: grant the minimum access required for the task.",
  },
  {
    id: 5,
    roundIndex: 5,
    title: "Borrowed ID Card at the Research Lab",
    description:
      "A student asks a friend to lend their ID card so the group can enter the restricted research lab after hours to finish a project. The card belongs to a postgraduate researcher whose affiliation is valid. Lab policy requires every occupant to have their own current authorization.",
    resourceType: "Restricted research space — Genomics Lab",
    requesterRole: "Undergraduate Student (using another person's card)",
    accessRequest: "Enter the restricted research lab with a borrowed ID card",
    correctDecision: "DENY",
    explanation:
      "Lending a credential collapses accountability: the audit log would record the cardholder, not the person inside the lab. It also escalates the borrower's privileges to the cardholder's, which is a direct privilege-escalation path. Authorized access is granted to a person, not to whatever card they are holding.",
    principle:
      "Credentials must not be shared, and each user must be individually authorized.",
  },
];

export const TOTAL_ROUNDS = SCENARIOS.length;

export function scenarioFor(roundIndex: number): ScenarioRecord | null {
  return SCENARIOS.find((s) => s.roundIndex === roundIndex) ?? null;
}