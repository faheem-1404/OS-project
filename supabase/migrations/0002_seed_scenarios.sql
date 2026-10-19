-- =====================================================================
-- CampusLock — Migration 0002 : seed the five fixed scenarios.
-- Safe to re-run: upsert on round_index.
-- =====================================================================

insert into public.scenarios
  (round_index, title, description, resource_type, requester_role,
   access_request, correct_decision, explanation, principle)
values
(1,
 'Unauthorized Entry to the Server Room',
 'A student presents a valid, unexpired university ID card at the server room door at 02:14. '
 'The card reader confirms the card is genuine and the account is active. The student is not an IT '
 'administrator and has no assignment that requires server room access.',
 'Physical secure zone — Server Room',
 'Undergraduate Student',
 'Enter the server room',
 'DENY',
 'The credential was authenticated, not authorized. A valid identity proves who you are — it says '
 'nothing about which doors you are allowed through. The access policy grants the server room only to '
 'the IT Administrator role, so the request fails even though the card is real and active.',
 'Having a valid identity does not mean having permission to access every resource.'),

(2,
 'Temporary Examiner — Time-Boxed Access',
 'A visiting examiner from a partner university is scheduled to moderate a paper in Examination Hall B, '
 'from 09:00 to 13:00 today. An access grant was issued to their visitor account for Examination Hall B '
 'only, with an explicit end time of 13:00. It is now 11:20 and the grant is still within its window.',
 'Examination venue — Hall B',
 'Visiting Examiner',
 'Enter the designated examination room while the grant is valid',
 'APPROVE',
 'The grant is real, it is scoped to exactly one room, and it has not expired. The system has already '
 'done the hard work: it issued narrow, time-bound access instead of a permanent one. Approving here is '
 'correct precisely because the access is temporary, scoped, and still inside its validity window — '
 'after 13:00 the same request must be denied.',
 'Temporary access should be scoped and time-bound.'),

(3,
 'A Former Student Still Marked Active',
 'A student who graduated two semesters ago approaches the library after hours. The system still shows '
 'their ID as ACTIVE and their affiliation record was never closed. Their university enrolment has ended '
 'and no new authorization has been established. Their stated reason is that they "just need to return a book".',
 'Library — after-hours restricted wing',
 'Former Student (graduated, affiliation ended)',
 'Enter the library after hours',
 'DENY',
 'Stale data is the danger here. The card still authenticates, but the relationship it stood for no longer '
 'exists. Access decisions must be driven by current authorization, not by whatever the directory last '
 'knew. Until HR and the identity provider independently close the record and a new authorization is '
 'granted, this person is a stranger at the door.',
 'Access must be updated when a person leaves the institution.'),

(4,
 'Professor Requesting Write Access to Grades',
 'A Professor of Applied Mathematics requests write access to the gradebook for two courses she currently '
 'teaches: MATH-310 and MATH-412. The access request asks for create, edit and publish permissions on '
 'both gradebooks, and nothing else.',
 'Academic record — Gradebook',
 'Professor',
 'Edit and publish grades for assigned courses only',
 'APPROVE',
 'This is least privilege working correctly. The professor holds the role, the two courses are genuinely '
 'assigned to her this term, and the request covers exactly what her job requires and nothing more. Note '
 'that the grant is scoped to two specific courses — the same professor asking to edit a gradebook she '
 'does not teach must be denied.',
 'Least privilege and need-to-know: grant the minimum access required for the task.'),

(5,
 'Borrowed ID Card at the Research Lab',
 'A student asks a friend to lend their ID card so the group can enter the restricted research lab after '
 'hours to finish a project. The card belongs to a postgraduate researcher whose affiliation is valid. '
 'Lab policy requires every occupant to have their own current authorization.',
 'Restricted research space — Genomics Lab',
 'Undergraduate Student (using another person''s card)',
 'Enter the restricted research lab with a borrowed ID card',
 'DENY',
 'Lending a credential collapses accountability: the audit log would record the cardholder, not the person '
 'inside the lab. It also escalates the borrower''s privileges to the cardholder''s, which is a direct '
 'privilege-escalation path. Authorized access is granted to a person, not to whatever card they are '
 'holding.',
 'Credentials must not be shared, and each user must be individually authorized.')
on conflict (round_index) do update set
  title            = excluded.title,
  description      = excluded.description,
  resource_type    = excluded.resource_type,
  requester_role   = excluded.requester_role,
  access_request   = excluded.access_request,
  correct_decision = excluded.correct_decision,
  explanation      = excluded.explanation,
  principle        = excluded.principle;