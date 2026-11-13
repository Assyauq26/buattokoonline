"""Read-only status authentication compatible with the installed app JWT contract."""
import base64
import hashlib
import hmac
from http.cookies import SimpleCookie
import json
import time
import core
from .trust import Rejected, strict_json


def actor(cookie,controller,now=None):
    now=int(time.time()) if now is None else now
    try:
        if not isinstance(cookie,str) or len(cookie)>8192:raise Rejected('session_expired')
        env=dict(line.split('=',1) for line in (core.CONFIG/'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
        if len(env.get('JWT_SECRET',''))<32:raise Rejected('session_expired')
        cookies=SimpleCookie();cookies.load(cookie)
        token=cookies[env.get('AUTH_COOKIE_NAME','store_session')].value
        if len(token)>4096:raise Rejected('session_expired')
        head,body,sig=token.split('.')
        def decode(value):
            return base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True)
        header=strict_json(decode(head));claims=strict_json(decode(body))
        if header.get('alg')!='HS256' or set(header)-{'alg','typ'}:raise Rejected('session_expired')
        expected=hmac.new(env['JWT_SECRET'].encode(),(head+'.'+body).encode(),hashlib.sha256).digest()
        if not hmac.compare_digest(decode(sig),expected):raise Rejected('session_expired')
        if (claims.get('iss')!=controller.config['origin'] or claims.get('aud')!='storefront'
            or type(claims.get('exp')) is not int or claims['exp']<=now
            or type(claims.get('iat')) is not int or claims['iat']>now+30
            or not isinstance(claims.get('email'),str) or not claims['email']
            or ('jti' in claims and (not isinstance(claims['jti'],str) or not 1<=len(claims['jti'])<=128))):
            raise Rejected('session_expired')
        # Same database role/sessionVersion/revocation check as the command socket.
        controller.actor(claims.get('sub'),claims.get('ver',0),hashlib.sha256(claims.get('jti',token).encode()).hexdigest(),claims['exp'])
        return claims['sub']
    except Rejected:raise
    except Exception:raise Rejected('session_expired') from None
