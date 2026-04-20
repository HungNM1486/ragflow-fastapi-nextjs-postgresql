import bcrypt


def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")
    if len(pw) > 72:
        raise ValueError("Mật khẩu quá dài (tối đa 72 byte cho bcrypt).")
    return bcrypt.hashpw(pw, bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            password_hash.encode("ascii"),
        )
    except ValueError:
        return False
