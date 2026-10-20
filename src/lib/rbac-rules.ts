export interface CampusRole {
  id: string;
  name: string;
  level: number;
  badgeTone: string;
  description: string;
  allowedResources: string[];
  mayRequestEmergency: string[];
}

export interface CampusResource {
  id: string;
  name: string;
  iconName: string;
  minLevel: number;
  category: "Datacenter" | "Academic" | "Research" | "General";
  description: string;
  policyRule: string;
}

export const CAMPUS_RESOURCES: CampusResource[] = [
  {
    id: "server_room",
    name: "Datacenter Server Room",
    iconName: "Server",
    minLevel: 5,
    category: "Datacenter",
    description: "Core campus servers, directory controllers & hypervisors.",
    policyRule: "Restricted to IT Security Administrators or active time-boxed Emergency Passes.",
  },
  {
    id: "research_lab",
    name: "Genomics & AI Research Lab",
    iconName: "Cpu",
    minLevel: 3,
    category: "Research",
    description: "Bio-containment workstations and AI cluster access.",
    policyRule: "Authorized for Professors, Lab Technicians, or approved Graduate Researchers.",
  },
  {
    id: "gradebook",
    name: "Registrar Gradebook System",
    iconName: "GraduationCap",
    minLevel: 4,
    category: "Academic",
    description: "Final exam grading, transcript records & gpa computations.",
    policyRule: "Strictly limited to Professors and Deans. Students & guests fail closed.",
  },
  {
    id: "hpc_cluster",
    name: "HPC Supercomputing Cluster",
    iconName: "Zap",
    minLevel: 3,
    category: "Research",
    description: "High-performance GPU cluster for research jobs.",
    policyRule: "Requires Graduate Researcher, IT Admin, or Professor authorization.",
  },
  {
    id: "faculty_lounge",
    name: "Faculty Executive Lounge",
    iconName: "Briefcase",
    minLevel: 3,
    category: "Academic",
    description: "Department council meeting hall and confidential faculty rooms.",
    policyRule: "Limited to Professors and Academic Deans.",
  },
  {
    id: "library",
    name: "24/7 Central Library & Archives",
    iconName: "BookOpen",
    minLevel: 1,
    category: "General",
    description: "Study halls, archive terminals, and campus workstations.",
    policyRule: "Open to active campus members. Revoked or graduated accounts are denied.",
  },
];

export const CAMPUS_ROLES: CampusRole[] = [
  {
    id: "undergrad",
    name: "Undergraduate Student",
    level: 1,
    badgeTone: "from-sky-500/20 to-blue-600/10 border-sky-500/40 text-sky-400",
    description: "Standard student identity. General campus access.",
    allowedResources: ["library"],
    mayRequestEmergency: ["research_lab", "server_room"],
  },
  {
    id: "grad_researcher",
    name: "Graduate Researcher",
    level: 2,
    badgeTone: "from-cyan-500/20 to-teal-600/10 border-cyan-500/40 text-cyan-400",
    description: "Graduate student with laboratory compute access.",
    allowedResources: ["library", "hpc_cluster"],
    mayRequestEmergency: ["research_lab", "server_room"],
  },
  {
    id: "teaching_asst",
    name: "Teaching Assistant (TA)",
    level: 2,
    badgeTone: "from-teal-500/20 to-emerald-600/10 border-teal-500/40 text-teal-400",
    description: "Academic assistant for classroom & lab operations.",
    allowedResources: ["library"],
    mayRequestEmergency: ["gradebook", "research_lab"],
  },
  {
    id: "professor",
    name: "Tenured Professor",
    level: 4,
    badgeTone: "from-purple-500/20 to-indigo-600/10 border-purple-500/40 text-purple-300",
    description: "Senior academic authority with research & grading capabilities.",
    allowedResources: ["library", "research_lab", "gradebook", "faculty_lounge", "hpc_cluster"],
    mayRequestEmergency: ["server_room"],
  },
  {
    id: "dean",
    name: "Department Dean",
    level: 5,
    badgeTone: "from-indigo-500/20 to-violet-600/10 border-indigo-500/40 text-indigo-300",
    description: "Executive academic officer overseeing departments and policies.",
    allowedResources: ["library", "faculty_lounge", "gradebook"],
    mayRequestEmergency: ["server_room", "research_lab"],
  },
  {
    id: "lab_tech",
    name: "Systems Lab Technician",
    level: 3,
    badgeTone: "from-emerald-500/20 to-teal-600/10 border-emerald-500/40 text-emerald-400",
    description: "Maintains hardware, computer labs, and instrument equipment.",
    allowedResources: ["library", "research_lab", "hpc_cluster"],
    mayRequestEmergency: ["server_room"],
  },
  {
    id: "it_admin",
    name: "IT Security Administrator",
    level: 5,
    badgeTone: "from-amber-500/20 to-yellow-600/10 border-amber-500/40 text-amber-300",
    description: "Master sysadmin with server root access & policy enforcement.",
    allowedResources: ["library", "server_room", "hpc_cluster", "research_lab"],
    mayRequestEmergency: ["gradebook"],
  },
  {
    id: "guest",
    name: "Campus Guest / Visitor",
    level: 1,
    badgeTone: "from-zinc-500/20 to-slate-600/10 border-zinc-500/40 text-zinc-400",
    description: "Temporary external guest. Restricted to general areas.",
    allowedResources: [],
    mayRequestEmergency: ["library"],
  },
  {
    id: "alumni",
    name: "Alumni (Graduated)",
    level: 0,
    badgeTone: "from-rose-500/20 to-red-600/10 border-rose-500/40 text-rose-400",
    description: "Former student whose credentials must be deprovisioned.",
    allowedResources: [],
    mayRequestEmergency: ["library"],
  },
  {
    id: "contractor",
    name: "External Contractor / Vendor",
    level: 1,
    badgeTone: "from-orange-500/20 to-amber-600/10 border-orange-500/40 text-orange-400",
    description: "Third-party vendor requiring explicit escorts or time-boxed passes.",
    allowedResources: [],
    mayRequestEmergency: ["server_room"],
  },
];

export function getRole(roleId: string): CampusRole {
  return CAMPUS_ROLES.find((r) => r.id === roleId) ?? CAMPUS_ROLES[0];
}

export function getResource(resourceId: string): CampusResource | undefined {
  return CAMPUS_RESOURCES.find((r) => r.id === resourceId);
}

export function evaluateAccess(
  roleId: string,
  resourceId: string,
  isRevoked: boolean,
  temporaryGrants: Array<{ resourceId: string; expiresAt: number }>,
): {
  granted: boolean;
  reason: string;
  source: "role_policy" | "temporary_grant" | "revoked" | "insufficient_privilege";
} {
  if (isRevoked) {
    return {
      granted: false,
      reason: "Identity badge is currently REVOKED by the IT Security Administrator. All access denied.",
      source: "revoked",
    };
  }

  const now = Date.now();
  const activeGrant = temporaryGrants.find((g) => g.resourceId === resourceId && g.expiresAt > now);
  if (activeGrant) {
    const secondsLeft = Math.ceil((activeGrant.expiresAt - now) / 1000);
    return {
      granted: true,
      reason: `Temporary Emergency Pass active (${secondsLeft}s remaining). Access approved by Administrator.`,
      source: "temporary_grant",
    };
  }

  const role = getRole(roleId);
  if (role.allowedResources.includes(resourceId)) {
    return {
      granted: true,
      reason: `Access Granted. Role "${role.name}" is authorized under standard RBAC policy.`,
      source: "role_policy",
    };
  }

  const resource = getResource(resourceId);
  return {
    granted: false,
    reason: `Access Denied. Role "${role.name}" lacks capability for ${resource?.name ?? resourceId}. Least privilege enforced.`,
    source: "insufficient_privilege",
  };
}
