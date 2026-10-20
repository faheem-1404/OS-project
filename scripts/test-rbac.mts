import assert from "node:assert/strict";
import { LocalStore } from "../src/lib/server/store/local-store";
import { CAMPUS_ROLES, CAMPUS_RESOURCES } from "../src/lib/rbac-rules";

async function run() {
  console.log("\n🧪 Running Smart Campus RBAC Simulation Test Suite...\n");

  const store = new LocalStore();
  const { snapshot: initialSnap, hostToken } = await store.createRoom({
    questionDuration: 15,
    totalRounds: 5,
    isDemo: false,
  });

  const code = initialSnap.code;
  console.log(`✓ Room created with code: ${code}`);

  // 1. Join 10 players and verify 10 distinct roles
  const playerTokens: string[] = [];
  const playerIds: string[] = [];
  const playerNicknames = [
    "Alice", "Bob", "Charlie", "Diana", "Ethan",
    "Fiona", "George", "Hannah", "Ian", "Julia"
  ];

  for (let i = 0; i < playerNicknames.length; i++) {
    const nick = playerNicknames[i];
    const { playerId, playerToken, snapshot } = await store.join(code, nick);
    playerTokens.push(playerToken);
    playerIds.push(playerId);

    const player = snapshot.players.find((p) => p.id === playerId);
    assert(player, `Player ${nick} should exist in snapshot`);
    const expectedRoleId = CAMPUS_ROLES[i % CAMPUS_ROLES.length].id;
    assert.equal(
      player.roleId,
      expectedRoleId,
      `Player ${nick} (index ${i}) should be assigned role ${expectedRoleId}, got ${player.roleId}`
    );
    console.log(`  ✓ Player ${nick} assigned role: ${player.roleId} (badgeStatus: ${player.badgeStatus})`);
  }

  // 2. Undergrad (Alice) tests door access
  const aliceToken = playerTokens[0];
  const libraryAccess = await store.attemptAccess(code, aliceToken, "library");
  assert.equal(libraryAccess.granted, true, "Undergrad should have access to library");
  console.log("✓ Undergrad library access: GRANTED under standard RBAC policy");

  const serverRoomAccess = await store.attemptAccess(code, aliceToken, "server_room");
  assert.equal(serverRoomAccess.granted, false, "Undergrad should be DENIED access to server_room");
  console.log("✓ Undergrad server room access: DENIED (least privilege enforced)");

  // 3. Undergrad requests emergency elevation for server room
  await store.requestEmergencyAccess(
    code,
    aliceToken,
    "server_room",
    "Emergency hardware diagnostic required for capstone project"
  );
  console.log("✓ Undergrad submitted emergency elevation request");

  const snapAfterReq = await store.snapshot(code, { isHost: true });
  assert(snapAfterReq?.accessRequests, "accessRequests must be present in snapshot");
  const pendingReq = snapAfterReq.accessRequests.find((r) => r.playerId === playerIds[0] && r.status === "pending");
  assert(pendingReq, "Emergency request should be pending");
  console.log(`✓ Admin console received pending request: ${pendingReq.reason}`);

  // 4. Host approves emergency access
  await store.resolveAccessRequest(code, hostToken, pendingReq.id, "approve");
  console.log("✓ Host APPROVED 60s emergency pass");

  // 5. Undergrad attempts server room again
  const retryServerAccess = await store.attemptAccess(code, aliceToken, "server_room");
  assert.equal(retryServerAccess.granted, true, "Undergrad should now be GRANTED access via temporary grant");
  console.log("✓ Undergrad server room access with temporary pass: GRANTED");

  // 6. Host promotes Undergrad to IT Security Administrator
  await store.updateUserRole(code, hostToken, playerIds[0], "it_admin");
  const snapAfterPromotion = await store.snapshot(code);
  const promotedAlice = snapAfterPromotion?.players.find((p) => p.id === playerIds[0]);
  assert.equal(promotedAlice?.roleId, "it_admin", "Alice should now be it_admin");
  console.log("✓ Host promoted Alice to 'it_admin'");

  // 7. Host revokes credentials (lockdown)
  await store.toggleUserRevocation(code, hostToken, playerIds[0]);
  const snapAfterRevoke = await store.snapshot(code);
  const revokedAlice = snapAfterRevoke?.players.find((p) => p.id === playerIds[0]);
  assert.equal(revokedAlice?.badgeStatus, "revoked", "Alice badge should be revoked");
  console.log("✓ Host REVOKED Alice's credential badge");

  // Revoked user should be denied all doors even library
  const revokedAccess = await store.attemptAccess(code, aliceToken, "library");
  assert.equal(revokedAccess.granted, false, "Revoked badge must be denied all access");
  console.log("✓ Revoked badge access to library: DENIED (zero-trust lockdown verified)");

  // 8. Host restores credentials
  await store.toggleUserRevocation(code, hostToken, playerIds[0]);
  const snapAfterRestore = await store.snapshot(code);
  const restoredAlice = snapAfterRestore?.players.find((p) => p.id === playerIds[0]);
  assert.equal(restoredAlice?.badgeStatus, "active", "Alice badge should be active again");
  console.log("✓ Host RESTORED Alice's credential badge");

  const restoredAccess = await store.attemptAccess(code, aliceToken, "library");
  assert.equal(restoredAccess.granted, true, "Restored badge should access library again");
  console.log("✓ Restored badge access: GRANTED");

  // 9. Verify SIEM audit trail
  const hostSnap = await store.snapshot(code, { isHost: true });
  assert(hostSnap?.auditLogs && hostSnap.auditLogs.length > 5, "Audit logs must record all operations");
  console.log(`✓ SIEM Audit terminal captured ${hostSnap.auditLogs.length} events:`);
  hostSnap.auditLogs.slice(0, 5).forEach((log) => {
    console.log(`   [${log.action}] ${log.actor} -> ${log.outcome}: ${log.detail}`);
  });

  console.log("\n🎉 ALL 9 RBAC SIMULATION TESTS PASSED PERFECTLY!\n");
}

run().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
