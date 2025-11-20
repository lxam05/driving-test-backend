import jwt from "jsonwebtoken";

export default function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];

  if (!header) {
    return res.status(401).json({ error: "No token provided." });
  }

  const token = header.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: "Invalid token format." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // save user info for next routes
    req.user = decoded;

    next();

  } catch (err) {
    console.error("JWT ERROR:", err);
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}
