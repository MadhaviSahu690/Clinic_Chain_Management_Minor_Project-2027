const jwt = require("jsonwebtoken");

/**
 * Reads the JWT from the "token" cookie (falls back to Authorization header
 * for API-style calls), verifies it, and attaches { id, role, name } to req.user.
 */
function getTokenFromReq(req) {
  if (req.cookies && req.cookies.token) return req.cookies.token;
  const header = req.headers.authorization;
  if (header) return header.replace("Bearer ", "");
  return null;
}

function attachUser(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
  } catch (err) {
    req.user = null;
  }
  next();
}

/**
 * Require a logged-in user. Optionally restrict to specific roles:
 *   router.get("/x", requireAuth(), handler)              -> any logged in role
 *   router.get("/x", requireAuth("admin"), handler)        -> admin only
 *   router.get("/x", requireAuth("admin","doctor"), handler)
 */
function requireAuth(...roles) {
  return (req, res, next) => {
    const token = getTokenFromReq(req);
    if (!token) {
      return res.redirect("/auth/login");
    }
    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      req.user = verified;
      req.doctor = verified; // backwards compatibility with older code

      if (roles.length && !roles.includes(verified.role)) {
        return res.status(403).send("Access denied: insufficient permissions.");
      }
      next();
    } catch (err) {
      return res.redirect("/auth/login");
    }
  };
}

module.exports = requireAuth;
module.exports.attachUser = attachUser;
module.exports.requireAuth = requireAuth;
