from app.core.config import settings
from tests.conftest import bearer, create_user

REGISTER = {"email": "Bia@Example.com", "password": "s3nha-forte", "full_name": "Bia"}
COOKIE = settings.refresh_cookie_name


async def test_register_normalizes_email_and_sends_verification(client, mailer):
    r = await client.post("/api/auth/register", json=REGISTER)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "bia@example.com"
    assert body["is_verified"] is False
    assert body["role"] == "customer"
    assert mailer.sent[0][0:2] == ("verify_email", "bia@example.com")


async def test_register_duplicate_email_is_case_insensitive(client):
    await client.post("/api/auth/register", json=REGISTER)
    r = await client.post("/api/auth/register", json={**REGISTER, "email": "bia@EXAMPLE.com"})
    assert r.status_code == 409


async def test_register_rejects_short_password(client):
    r = await client.post("/api/auth/register", json={**REGISTER, "password": "123"})
    assert r.status_code == 422


async def test_login_errors_do_not_reveal_whether_account_exists(client):
    await client.post("/api/auth/register", json=REGISTER)
    wrong_pw = await client.post(
        "/api/auth/login", json={"email": REGISTER["email"], "password": "errada123"}
    )
    unknown = await client.post(
        "/api/auth/login", json={"email": "ninguem@example.com", "password": "errada123"}
    )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


async def test_login_sets_httponly_refresh_cookie_scoped_to_auth(client):
    await client.post("/api/auth/register", json=REGISTER)
    r = await client.post(
        "/api/auth/login", json={"email": REGISTER["email"], "password": REGISTER["password"]}
    )
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "Path=/api/auth" in cookie
    assert "SameSite=lax" in cookie


async def test_me_requires_valid_access_token(client):
    login = await create_user(client)
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer x"})).status_code == 401
    r = await client.get("/api/auth/me", headers=bearer(login))
    assert r.json()["email"] == "ana@example.com"


async def test_verify_email_flow(client, mailer):
    await client.post("/api/auth/register", json=REGISTER)
    token = mailer.token_from("verify_email")
    r = await client.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 200
    assert r.json()["is_verified"] is True


async def test_verify_email_rejects_tampered_token(client, mailer):
    await client.post("/api/auth/register", json=REGISTER)
    token = mailer.token_from("verify_email")
    r = await client.post("/api/auth/verify-email", json={"token": token[:-2] + "xx"})
    assert r.status_code == 400


async def test_access_token_cannot_be_used_as_email_token(client):
    login = await create_user(client, verified=False)
    r = await client.post("/api/auth/verify-email", json={"token": login["access_token"]})
    assert r.status_code == 400


async def test_refresh_rotates_token(client):
    await create_user(client)
    first = client.cookies[COOKIE]
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 200
    assert r.json()["access_token"]
    assert client.cookies[COOKIE] != first


async def test_reusing_rotated_refresh_token_revokes_whole_family(client):
    await create_user(client)
    stolen = client.cookies[COOKIE]
    await client.post("/api/auth/refresh")  # legit user rotates
    current = client.cookies[COOKIE]

    # Attacker replays the old token: rejected, and cookie is cleared.
    client.cookies.set(COOKIE, stolen, path="/api/auth")
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401

    # The legit user's current token was revoked too, forcing a fresh login.
    client.cookies.set(COOKIE, current, path="/api/auth")
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_refresh_without_cookie(client):
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_logout_revokes_refresh_token(client):
    await create_user(client)
    token = client.cookies[COOKIE]
    assert (await client.post("/api/auth/logout")).status_code == 204
    client.cookies.set(COOKIE, token, path="/api/auth")
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_forgot_password_is_silent_for_unknown_email(client, mailer):
    r = await client.post("/api/auth/forgot-password", json={"email": "ninguem@example.com"})
    assert r.status_code == 202
    assert mailer.sent == []


async def test_reset_password_flow(client, mailer):
    await create_user(client)
    old_session = client.cookies[COOKIE]

    await client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    token = mailer.token_from("reset_password")
    r = await client.post("/api/auth/reset-password", json={"token": token, "password": "nova-s3nha"})
    assert r.status_code == 204

    # Token is single-use (bound to the old password hash).
    r = await client.post("/api/auth/reset-password", json={"token": token, "password": "outra-s3nha"})
    assert r.status_code == 400

    # Existing sessions were logged out.
    client.cookies.set(COOKIE, old_session, path="/api/auth")
    assert (await client.post("/api/auth/refresh")).status_code == 401

    # Old password no longer works, new one does.
    old = await client.post("/api/auth/login", json={"email": "ana@example.com", "password": "s3nha-forte"})
    new = await client.post("/api/auth/login", json={"email": "ana@example.com", "password": "nova-s3nha"})
    assert old.status_code == 401
    assert new.status_code == 200


async def test_auth_responses_are_not_cacheable(client):
    await create_user(client)
    r = await client.post("/api/auth/refresh")
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "no-store" not in (await client.get("/api/products")).headers.get("cache-control", "")
