/* VC Play admin command bridge.
 * Firebase compat SDK 10.x must be loaded before this file.
 * This module only transports trusted admin commands; each game supplies
 * its own reset/result handlers for its own state schema.
 */
(function (global) {
  'use strict';

  const MAX_COMMAND_AGE_MS = 120000;
  const VALID_RESULTS = new Set(['player1', 'player2', 'draw']);

  function validRoomId(value) {
    const id = String(value == null ? '' : value);
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
  }

  function attachAdminGameControls(options) {
    const opts = options || {};
    const database = opts.database;
    const roomId = validRoomId(opts.roomId);
    if (!database || typeof database.ref !== 'function') {
      throw new Error('A Firebase Realtime Database instance is required.');
    }
    if (!roomId) throw new Error('A valid room ID is required.');
    if (typeof opts.onResetMatch !== 'function' ||
        typeof opts.onOverrideResult !== 'function') {
      throw new Error('Provide onResetMatch and onOverrideResult handlers.');
    }

    const commandRef = database.ref('bagchalRooms/' + roomId + '/adminControl/command');
    const storageKey = 'vcplay-admin-command:' + roomId;
    let stopped = false;
    let lastCommandId = '';

    try {
      lastCommandId = global.sessionStorage.getItem(storageKey) || '';
    } catch (_) {}

    async function handleSnapshot(snapshot) {
      if (stopped || !snapshot || !snapshot.exists()) return;
      const command = snapshot.val() || {};
      const id = String(command.id || '');
      const type = String(command.type || '');
      const issuedAt = Number(command.issuedAt || 0);

      if (!id || id === lastCommandId) return;
      if (!Number.isFinite(issuedAt) ||
          issuedAt > Date.now() + 30000 ||
          Date.now() - issuedAt > MAX_COMMAND_AGE_MS) return;
      if (type !== 'reset_match' && type !== 'override_result') return;
      if (type === 'override_result' && !VALID_RESULTS.has(command.result)) return;

      // Mark before invoking the handler so a duplicate Firebase event cannot
      // run the same command twice in this browser tab.
      lastCommandId = id;
      try { global.sessionStorage.setItem(storageKey, id); } catch (_) {}

      const context = {
        roomId,
        command: Object.freeze({
          id,
          type,
          result: command.result || null,
          issuedAt,
          issuedBy: String(command.issuedBy || '')
        })
      };

      try {
        if (type === 'reset_match') {
          await opts.onResetMatch(context);
        } else {
          await opts.onOverrideResult(Object.assign({}, context, {
            result: command.result
          }));
        }
        if (typeof opts.onCommandHandled === 'function') {
          opts.onCommandHandled(context);
        }
      } catch (error) {
        if (typeof opts.onError === 'function') opts.onError(error, context);
      }
    }

    function onValue(snapshot) {
      handleSnapshot(snapshot).catch(error => {
        if (typeof opts.onError === 'function') opts.onError(error, null);
      });
    }

    function onError(error) {
      if (typeof opts.onError === 'function') opts.onError(error, null);
    }

    commandRef.on('value', onValue, onError);

    return function detachAdminGameControls() {
      if (stopped) return;
      stopped = true;
      commandRef.off('value', onValue);
    };
  }

  global.VCPlayAdminGameControls = Object.freeze({
    attach: attachAdminGameControls
  });
})(typeof window !== 'undefined' ? window : this);
