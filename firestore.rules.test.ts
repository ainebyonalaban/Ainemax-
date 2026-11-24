/**
 * AINEMAX Phase 2 Firestore Security Rules Test Matrix ("Dirty Dozen")
 *
 * Designed for verification against Firebase Local Emulator Suite (@firebase/rules-unit-testing)
 * and security_spec.md invariants.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  expected: 'PERMISSION_DENIED';
  description: string;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    operation: 'create',
    path: '/users/attacker',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects profile creation when request.auth is null.',
  },
  {
    id: 2,
    name: 'Identity Spoofing',
    operation: 'create',
    path: '/users/userB',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects userA creating a profile under userB document ID or uid field.',
  },
  {
    id: 3,
    name: 'Self-Verification Escalation (Create)',
    operation: 'create',
    path: '/users/userA',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects incoming().isVerified == true during user profile creation.',
  },
  {
    id: 4,
    name: 'Self-Verification Escalation (Update)',
    operation: 'update',
    path: '/users/userA',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects owner attempting to set isVerified: true on update.',
  },
  {
    id: 5,
    name: 'Shadow / Ghost Field Injection',
    operation: 'update',
    path: '/users/userA',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects unexpected keys such as role or permissions via affectedKeys().hasOnly().',
  },
  {
    id: 6,
    name: 'PII Cross-User Read',
    operation: 'get',
    path: '/users/userB/private/info',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects userA reading userB private PII document.',
  },
  {
    id: 7,
    name: 'PII Blanket List',
    operation: 'list',
    path: '/users/userB/private',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects userA listing userB private subcollection.',
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/users/userA',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects createdAt/updatedAt values that do not equal request.time.',
  },
  {
    id: 9,
    name: 'ID Poisoning',
    operation: 'create',
    path: '/users/' + 'a'.repeat(256),
    expected: 'PERMISSION_DENIED',
    description: 'Rejects oversized or invalid path IDs via isValidId().',
  },
  {
    id: 10,
    name: 'Username Hijack',
    operation: 'create',
    path: '/usernames/taken_handle',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects claiming an already-reserved username document.',
  },
  {
    id: 11,
    name: 'Admin Table Self-Enrollment',
    operation: 'create',
    path: '/admins/userA',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects all client writes to /admins/{userId}.',
  },
  {
    id: 12,
    name: 'Unverified Email Spoofing',
    operation: 'create',
    path: '/users/spoofUid',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects requests where email_verified is false even if email matches admin.',
  },
];
