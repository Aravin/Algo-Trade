// pages/api/protected.js
import { withApiAuthRequired, getSession, Session } from '@auth0/nextjs-auth0';

export default withApiAuthRequired(async function myApiRoute(req, res) {
  const { user } = getSession(req, res) as Session;
  res.json({ protected: 'My Secret', id: user.sub });
});
