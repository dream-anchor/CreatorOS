# IG Autopublisher (v1)

Automatisierte Erstellung und Veröffentlichung von Instagram-Feed-Posts mit KI-gestützter Caption-Generierung.

## Features

- **AI Draft Generation**: Automatische Erstellung von Captions, Hashtags und Alt-Text
- **Brand Rules**: Konfigurierbare Markenrichtlinien
- **Review Workflow**: Manuelle Freigabe vor jeder Veröffentlichung
- **Calendar Scheduling**: Zeitgesteuerte Veröffentlichung
- **AI Image Generation**: AI-generierte Bilder via Lovable AI

## Setup

### Meta Developer App

1. Erstelle App auf [developers.facebook.com](https://developers.facebook.com/)
2. Füge "Facebook Login for Business" hinzu
3. Berechtigungen: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `instagram_business_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`
4. OAuth Redirect URL: `https://<project-id>.supabase.co/functions/v1/meta-oauth-callback`

### Supabase Secrets

| Secret | Beschreibung |
|--------|--------------|
| `META_APP_ID` | Meta App ID |
| `META_APP_SECRET` | Meta App Secret |
| `SITE_URL` | Frontend URL |

### Scheduler Cron

```sql
SELECT cron.schedule('scheduler-tick', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://<project-id>.supabase.co/functions/v1/scheduler-tick',
    headers := '{"Authorization": "Bearer <anon-key>"}'::jsonb
  );
$$);
```

## Post Status Flow

```
IDEA → DRAFT → READY_FOR_REVIEW → APPROVED → SCHEDULED → PUBLISHED
```
