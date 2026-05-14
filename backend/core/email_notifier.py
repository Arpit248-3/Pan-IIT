"""
AyuScout V2 — Gmail SMTP Email Notifier
=========================================
Two email flows:
  1. send_new_query_email()      → Fires when a user submits a Help query.
                                   Notifies the admin at ADMIN_EMAIL.
  2. send_query_answered_email() → Fires when admin answers a query.
                                   Notifies the user at their registered email.

Setup (one-time):
  1. Enable 2-Step Verification on your Gmail account.
  2. Go to: https://myaccount.google.com/apppasswords
  3. Create App Password for "Mail" → "Other device".
  4. Copy the 16-character password (WITHOUT spaces).
  5. Add to .env:
       GMAIL_USER=your@gmail.com
       GMAIL_APP_PASSWORD=abcdabcdabcdabcd
       ADMIN_EMAIL=1da23cs019.cs@drait.edu.in

IMPORTANT: Use the App Password — NOT your regular Gmail password.
           A regular password will cause SMTPAuthenticationError 535.

Leave GMAIL_USER blank to use mock/log-only mode (no email sent).
"""

import os
import smtplib
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

GMAIL_USER     = os.getenv("GMAIL_USER", "")
GMAIL_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL", "1da23cs019.cs@drait.edu.in")


# ─── Shared SMTP sender ────────────────────────────────────────────────────

def _send_email(to_address: str, subject: str, html_body: str, text_body: str) -> bool:
    """
    Internal helper: builds a MIME email and sends it via Gmail SMTP TLS.
    Falls back to console logging if credentials are missing.
    Returns True on success (or mock-success), False on hard failure.
    """
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print("\n📧 [EMAIL-NOTIFIER] Gmail credentials not configured in .env")
        print(f"   → TO:      {to_address}")
        print(f"   → SUBJECT: {subject}")
        print("   → Add GMAIL_USER and GMAIL_APP_PASSWORD to .env to send real emails.\n")
        return True   # "success" so the API doesn't fail

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f"AyuScout V2 <{GMAIL_USER}>"
    msg['To']      = to_address

    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.ehlo()
            server.starttls()
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, to_address, msg.as_string())
        print(f"✅ [EMAIL-NOTIFIER] Email sent successfully → {to_address}")
        return True
    except smtplib.SMTPAuthenticationError:
        print("❌ [EMAIL-NOTIFIER] Gmail auth FAILED.")
        print("   → Make sure you are using an App Password, NOT your regular Gmail password.")
        print("   → Generate one at: https://myaccount.google.com/apppasswords")
        return False
    except Exception as e:
        print(f"❌ [EMAIL-NOTIFIER] Failed to send email: {e}")
        traceback.print_exc()
        return False


# ─── Flow 1: Notify Admin of New Query ─────────────────────────────────────

def send_new_query_email(user_name: str, user_email: str, question: str) -> bool:
    """
    Sends an email to the ADMIN when a user submits a new help query.
    Admin email is read from ADMIN_EMAIL env var.
    """
    subject = f"📬 New Help Query from {user_name} — AyuScout V2"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {{ font-family: 'Inter', Arial, sans-serif; background: #F7F9FB; margin: 0; padding: 0; }}
        .wrapper {{ max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px;
                    border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }}
        .header {{ background: #0A192F; padding: 28px 32px; text-align: center; }}
        .header h1 {{ color: #fff; font-size: 22px; margin: 0; letter-spacing: -0.02em; }}
        .header p {{ color: rgba(255,255,255,0.5); font-size: 12px; margin: 4px 0 0; }}
        .body {{ padding: 28px 32px; }}
        .greeting {{ font-size: 16px; font-weight: 600; color: #191C1E; margin-bottom: 8px; }}
        .intro {{ font-size: 14px; color: #64748B; margin-bottom: 24px; line-height: 1.6; }}
        .section-label {{ font-size: 11px; font-weight: 700; color: #94A3B8;
                          text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }}
        .info-row {{ display: flex; gap: 8px; margin-bottom: 6px; font-size: 14px; }}
        .info-key {{ font-weight: 600; color: #475569; min-width: 90px; }}
        .question-box {{ background: #FEF9EC; border: 1px solid #F59E0B55; border-radius: 8px;
                         padding: 14px 16px; font-size: 14px; color: #191C1E;
                         margin-bottom: 20px; line-height: 1.6; margin-top: 12px; }}
        .footer {{ background: #F7F9FB; padding: 16px 32px; text-align: center;
                   border-top: 1px solid #E2E8F0; }}
        .footer p {{ font-size: 12px; color: #94A3B8; margin: 0; }}
        .btn {{ display: inline-block; background: #EF4444; color: #fff;
                padding: 10px 24px; border-radius: 6px; font-size: 14px;
                font-weight: 600; text-decoration: none; margin-top: 20px; }}
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>🧬 AyuScout V2 — Admin Alert</h1>
          <p>Pharmacovigilance Intelligence Platform</p>
        </div>
        <div class="body">
          <div class="greeting">New Help Query Received 📬</div>
          <div class="intro">
            A user has submitted a new query in the Help Center.
            Please review and respond through the Admin Panel.
          </div>

          <div class="section-label">User Details</div>
          <div class="info-row"><span class="info-key">Name:</span> {user_name}</div>
          <div class="info-row"><span class="info-key">Email:</span> {user_email}</div>

          <div class="section-label" style="margin-top:16px;">Their Question</div>
          <div class="question-box">{question}</div>

          <div style="text-align:center;">
            <a href="http://localhost:5173" class="btn">Open Admin Panel →</a>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated alert from the AyuScout V2 Help Center system.</p>
        </div>
      </div>
    </body>
    </html>
    """

    text_body = f"""New Help Query — AyuScout V2

User: {user_name} <{user_email}>

Question:
{question}

Log in to the Admin Panel to respond: http://localhost:5173

— AyuScout V2 System
"""

    print(f"\n📬 [EMAIL-NOTIFIER] Notifying admin ({ADMIN_EMAIL}) about new query from {user_name}")
    return _send_email(ADMIN_EMAIL, subject, html_body, text_body)


# ─── Flow 2: Notify User of Admin Answer ───────────────────────────────────

def send_query_answered_email(user_email: str, user_name: str, question: str, answer: str) -> bool:
    """
    Send an email to the user notifying them their help query has been answered.
    """
    subject = "✅ Your AyuScout query has been answered!"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {{ font-family: 'Inter', Arial, sans-serif; background: #F7F9FB; margin: 0; padding: 0; }}
        .wrapper {{ max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px;
                    border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }}
        .header {{ background: #0A192F; padding: 28px 32px; text-align: center; }}
        .header h1 {{ color: #fff; font-size: 22px; margin: 0; letter-spacing: -0.02em; }}
        .header p {{ color: rgba(255,255,255,0.5); font-size: 12px; margin: 4px 0 0; }}
        .body {{ padding: 28px 32px; }}
        .greeting {{ font-size: 16px; font-weight: 600; color: #191C1E; margin-bottom: 8px; }}
        .intro {{ font-size: 14px; color: #64748B; margin-bottom: 24px; line-height: 1.6; }}
        .section-label {{ font-size: 11px; font-weight: 700; color: #94A3B8;
                          text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }}
        .question-box {{ background: #F7F9FB; border: 1px solid #E2E8F0; border-radius: 8px;
                         padding: 14px 16px; font-size: 14px; color: #191C1E;
                         margin-bottom: 20px; line-height: 1.6; }}
        .answer-box {{ background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.25);
                       border-radius: 8px; padding: 14px 16px; font-size: 14px;
                       color: #191C1E; line-height: 1.6; }}
        .answer-box .badge {{ display: inline-block; background: #10B981; color: #fff;
                              font-size: 11px; font-weight: 700; padding: 2px 10px;
                              border-radius: 12px; margin-bottom: 10px; }}
        .footer {{ background: #F7F9FB; padding: 16px 32px; text-align: center;
                   border-top: 1px solid #E2E8F0; }}
        .footer p {{ font-size: 12px; color: #94A3B8; margin: 0; }}
        .btn {{ display: inline-block; background: #007BFF; color: #fff;
                padding: 10px 24px; border-radius: 6px; font-size: 14px;
                font-weight: 600; text-decoration: none; margin-top: 20px; }}
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>🧬 AyuScout V2</h1>
          <p>Pharmacovigilance Intelligence Platform</p>
        </div>
        <div class="body">
          <div class="greeting">Hi {user_name}! 👋</div>
          <div class="intro">
            Great news — an AyuScout administrator has reviewed and answered your query.
            Here's a summary:
          </div>

          <div class="section-label">Your Question</div>
          <div class="question-box">{question}</div>

          <div class="section-label">Admin's Answer</div>
          <div class="answer-box">
            <span class="badge">✓ Answered</span><br>
            {answer}
          </div>

          <div style="text-align:center;">
            <a href="http://localhost:5173" class="btn">View in Dashboard →</a>
          </div>
        </div>
        <div class="footer">
          <p>You're receiving this because you submitted a query on the AyuScout V2 platform.<br>
          This is an automated message from the AyuScout Help Center.</p>
        </div>
      </div>
    </body>
    </html>
    """

    text_body = f"""Hi {user_name},

Your AyuScout query has been answered!

YOUR QUESTION:
{question}

ADMIN ANSWER:
{answer}

Visit the Help Center to view the full thread: http://localhost:5173

— AyuScout V2 Team
"""

    print(f"\n✅ [EMAIL-NOTIFIER] Sending answer notification to {user_email}")
    return _send_email(user_email, subject, html_body, text_body)
