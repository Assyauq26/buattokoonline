"""Read-only HTTP smoke on existing identities. No login/action/checkout API writes.

Short-lived signed probes remain in process memory. No token, identity, HTML or
secret is logged. Existing sessions, passwords and revocation state are untouched.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.parse
import urllib.request
import core


def sessions():
    values = dict(line.split('=', 1) for line in (core.CONFIG / 'runtime.env').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    secret = values['JWT_SECRET']
    origin = values['APP_ORIGIN']
    users = json.loads(core.sql('''SELECT json_build_object(
      'seller',(SELECT to_jsonb(u) FROM (SELECT u.id,u.email,u."sessionVersion" FROM "User" u
        JOIN "UserRole" ur ON ur."userId"=u.id JOIN "Role" r ON r.id=ur."roleId"
        WHERE u."isActive" AND r.name='Admin' ORDER BY u.id LIMIT 1) u),
      'customer',(SELECT to_jsonb(u) FROM (SELECT u.id,u.email,u."sessionVersion" FROM "User" u
        JOIN "Customer" c ON c."userId"=u.id WHERE u."isActive" ORDER BY u.id LIMIT 1) u));'''))
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=').decode()
    result = {}
    for kind, user in users.items():
        if not user:
            raise core.StoreError('Existing ' + kind + ' identity unavailable for read-only smoke')
        now = int(time.time())
        payload = {'sub': user['id'], 'email': user['email'], 'ver': user['sessionVersion'],
                   'jti': secrets.token_hex(16), 'iat': now, 'exp': now + 300,
                   'iss': origin, 'aud': 'storefront'}
        message = encode({'alg': 'HS256'}) + '.' + encode(payload)
        signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
        result[kind] = message + '.' + signature
    return result


def verify(include_promotions=True):
    tokens = sessions()
    routes = [('public', '/'), ('public', '/login'), ('seller', '/admin/products'),
              ('seller', '/admin/marketing?tab=flash'), ('seller', '/admin/marketing?tab=voucher'),
              ('customer', '/account'), ('customer', '/account/orders')]
    campaign = core.sql('SELECT coalesce((SELECT id::text FROM "FlashSaleCampaign" ORDER BY id LIMIT 1),\'\');')
    voucher = core.sql('SELECT coalesce((SELECT id::text FROM "Coupon" ORDER BY id LIMIT 1),\'\');')
    product = core.sql('SELECT coalesce((SELECT slug FROM "Product" WHERE status=\'PUBLISHED\' ORDER BY id LIMIT 1),\'\');')
    if not include_promotions:
        routes = [(kind,path) for kind,path in routes if not path.startswith('/admin/marketing')]
    if campaign and include_promotions:
        routes.append(('seller', '/admin/marketing?tab=flash&view=detail&id=' + urllib.parse.quote(campaign)))
    if voucher and include_promotions:
        routes.append(('seller', '/admin/marketing?tab=voucher&view=detail&id=' + urllib.parse.quote(voucher)))
    if product:
        routes.append(('public', '/product/' + urllib.parse.quote(product)))
    results = []
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for kind, path in routes:
        headers = {'User-Agent': 'Hubify-readonly-release-smoke', 'Cache-Control': 'no-cache'}
        if kind in tokens:
            headers['Cookie'] = 'store_session=' + tokens[kind]
        request = urllib.request.Request('http://127.0.0.1:3000' + path, headers=headers)
        with opener.open(request, timeout=30) as response:
            body = response.read(8 * 1024 * 1024)
            if response.status != 200 or (kind != 'public' and '/login' in response.url):
                raise core.StoreError('Read-only authenticated route failed')
            if b'Application error:' in body or b'Internal Server Error' in body:
                raise core.StoreError('Runtime error in read-only route')
        results.append({'kind': kind, 'route': path.split('&id=')[0], 'status': 200})
    return {'read_only': True, 'routes': results, 'voucher_detail': 'tested' if voucher else 'no_existing_voucher'}
