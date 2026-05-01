import { slidingWindow } from "@arcjet/node";
import aj from '../config/arject.js';
const securityMiddleware = async (req, res, next) => {
    if (process.env.NODE_ENV === 'test')
        return next();
    try {
        const role = req.user?.role ?? 'guest';
        let limit;
        let message;
        switch (role) {
            case 'admin':
                limit = 300;
                message = 'Admin requests limit exceeded (500 per minute). Slow down.';
                break;
            case 'teacher':
            case 'student':
                limit = 200;
                message = 'User requests limit exceeded (200 per minute). Please wait.';
                break;
            default:
                limit = 50;
                message = 'Guest requests limit exceeded (50 per minute). Please sign up for higher limits.';
                break;
        }
        const client = aj.withRule(slidingWindow({
            mode: "LIVE",
            interval: "1m",
            max: limit
        }));
        const arcjetRequest = {
            headers: req.headers,
            method: req.method,
            url: req.originalUrl ?? req.url,
            socket: { remoteAddress: req.socket.remoteAddress ?? req.ip ?? '0.0.0.0' },
        };
        const decision = await client.protect(arcjetRequest);
        if (decision.isDenied() && decision.reason.isBot()) {
            return res.status(403).json({ error: 'Forbidden', message: 'Automated request are not allowed.' });
        }
        if (decision.isDenied() && decision.reason.isShield()) {
            return res.status(403).json({ error: 'Forbidden', message: 'Request blocked by security policy' });
        }
        if (decision.isDenied() && decision.reason.isRateLimit()) {
            return res.status(429).json({ error: 'Too Many Requests', message });
        }
        next();
    }
    catch (e) {
        console.error('Arcjet middleware error:', e);
        res.status(500).json({ error: 'Internal Server Error', message: 'Something went wrong with security middleware' });
    }
};
export default securityMiddleware;
//# sourceMappingURL=security.js.map