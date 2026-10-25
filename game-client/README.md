# VC Play separate game-client admin command bridge

This folder is intentionally separate from the protected root `/index.html`.
Nothing in this folder is loaded by the current live site automatically.

## What is included

- `admin-control-bridge.js`: Firebase Realtime Database listener for Super Admin reset and result-override commands.
- The admin panel sends commands to:
  `bagchalRooms/{roomId}/adminControl/command`

Command payloads:

- Reset: `{ id, type: "reset_match", issuedAt, issuedBy }`
- Result: `{ id, type: "override_result", result: "player1" | "player2" | "draw", issuedAt, issuedBy }`

## Connect a game client

Load Firebase compat app/database SDK 10.x, initialize the same Firebase project, then load this bridge script. Once a room is joined, attach it with handlers implemented by that game's own state engine:

```js
const detachAdminControls = window.VCPlayAdminGameControls.attach({
  database: firebase.database(),
  roomId: currentRoomId,

  // Implement using this game's actual state schema.
  // Ensure the reset is idempotent across both connected players.
  onResetMatch: async ({ roomId, command }) => {
    await resetThisGameUsingItsExistingRules();
  },

  // Map player1/player2 to the actual seats/sides in this room.
  onOverrideResult: async ({ roomId, result, command }) => {
    await setThisGameResultUsingItsExistingRules(result);
  },

  onError: (error) => console.error('Admin command failed', error)
});

// Call when leaving the room or disposing the game view.
function leaveRoom() {
  detachAdminControls();
}
```

The two game-state functions above are deliberate integration placeholders, not existing VC Play functions. Each game needs its own implementation because BaghChal, Chess, Checkers, and the mini-games store state differently. Do not copy these placeholder names as working functions.

## Important behavior and safety

- Commands expire after two minutes and are processed once per browser tab session.
- The bridge does not change game state itself. It calls the game's supplied handlers.
- The handlers must validate the current room state and write only the correct game fields.
- A reset handler must be idempotent and coordinate the shared reset so two clients do not race.
- A result handler must map `player1`, `player2`, or `draw` to the actual player roles for that room.
- Firebase Realtime Database rules must restrict writes to `adminControl/command` to Super Admin accounts. Do not let ordinary players issue these commands.
- The existing client does not load this bridge yet. Deploying these files alone will not make the current live games respond. Integration into the separate game-client entry point is still required.

## Protected file guarantee

This feature branch does not modify `/index.html`. The root file SHA was checked before and after the admin-panel changes and remained:

`5bbd700454eabec8ab8b3ab28cb52ed7c11f7f1d`
