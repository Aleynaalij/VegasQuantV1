export function GET() {
  return Response.json(
    {
      email: Boolean(
        process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL_FROM,
      ),
      sms: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
