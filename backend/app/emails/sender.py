from email.message import EmailMessage
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import settings
from app.emails.mailer import Template

SUBJECTS: dict[Template, str] = {
    "verify_email": "Confirme seu e-mail na Vitrine",
    "reset_password": "Redefinição de senha",
    "order_confirmation": "Pedido #{short_id} confirmado",
    "order_shipped": "Pedido #{short_id} enviado",
    "order_refunded": "Reembolso do pedido #{short_id}",
}


def brl(cents: int) -> str:
    # 123456 -> "R$ 1.234,56"
    return "R$ " + f"{cents / 100:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,  # a missing variable fails loudly instead of sending a broken email
)
env.filters["brl"] = brl


def render(template: Template, context: dict) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = SUBJECTS[template].format(**context)
    msg["From"] = settings.mail_from
    msg.set_content(env.get_template(f"{template}.txt").render(context))
    msg.add_alternative(env.get_template(f"{template}.html").render(context), subtype="html")
    return msg


async def deliver(to: str, template: Template, context: dict) -> None:
    msg = render(template, context)
    msg["To"] = to
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
        start_tls=settings.smtp_tls,
    )
