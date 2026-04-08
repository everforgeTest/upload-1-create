function sendOk(ctx, user, data) {
  ctx.sendResponse(user, {
    ok: true,
    data
  });
}

function sendErr(ctx, user, code, message) {
  ctx.sendResponse(user, {
    ok: false,
    error: { code, message }
  });
}

module.exports = { sendOk, sendErr };
