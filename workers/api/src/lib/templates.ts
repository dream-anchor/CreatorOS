export interface TemplateData {
  eventTitle: string;
  dateFormatted: string;
  timeFormatted: string;
  venue: string;
  city: string;
  backgroundImageUrl: string;
  daysUntil: number;
  ticketUrl?: string;
}

const FONTS_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">';

function baseHtml(backgroundImageUrl: string, inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${FONTS_LINK}
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1080px;
  height: 1080px;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  color: #fff;
}
.bg {
  width: 1080px;
  height: 1080px;
  background-image: url('${backgroundImageUrl}');
  background-size: cover;
  background-position: center;
  position: relative;
}
.overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top,
    rgba(0,0,0,0.85) 0%,
    rgba(0,0,0,0.4) 50%,
    rgba(0,0,0,0.15) 100%
  );
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 60px;
}
.label {
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #FFA500;
  margin-bottom: 16px;
}
.title {
  font-family: 'Playfair Display', serif;
  font-weight: 700;
  color: #fff;
}
.meta {
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  color: rgba(255,255,255,0.7);
}
.accent {
  color: #FFA500;
}
.divider {
  width: 60px;
  height: 2px;
  background: #FFA500;
  margin: 20px 0;
}
</style>
</head>
<body>
<div class="bg">
<div class="overlay">
${inner}
</div>
</div>
</body>
</html>`;
}

/** ANNOUNCEMENT — 14 Tage vorher */
export function renderAnnouncementHtml(data: TemplateData): string {
  const ticket = data.ticketUrl
    ? `<div style="margin-top:20px;font-size:14px;font-weight:600;color:#FFA500;letter-spacing:2px;text-transform:uppercase;">TICKETS VERFÜGBAR</div>`
    : "";

  return baseHtml(
    data.backgroundImageUrl,
    `
    <div class="label">NEUE VORSTELLUNG</div>
    <div class="title" style="font-size:48px;line-height:1.15;margin-bottom:24px;">${escapeHtml(data.eventTitle)}</div>
    <div class="divider"></div>
    <div class="meta" style="font-size:20px;margin-bottom:8px;">${escapeHtml(data.dateFormatted)} · ${escapeHtml(data.timeFormatted)}</div>
    <div class="meta" style="font-size:18px;color:rgba(255,255,255,0.55);">${escapeHtml(data.venue)}, ${escapeHtml(data.city)}</div>
    ${ticket}
    `
  );
}

/** COUNTDOWN — 7 Tage vorher */
export function renderCountdownHtml(data: TemplateData): string {
  const days = Math.max(1, Math.abs(data.daysUntil));

  return baseHtml(
    data.backgroundImageUrl,
    `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding-bottom:120px;">
      <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:200px;line-height:1;color:#FFA500;">${days}</div>
      <div style="font-weight:600;font-size:24px;letter-spacing:5px;text-transform:uppercase;color:#fff;margin-top:-10px;">TAGE</div>
    </div>
    <div style="text-align:center;">
      <div class="divider" style="margin:0 auto 20px;"></div>
      <div class="title" style="font-size:32px;margin-bottom:12px;">${escapeHtml(data.eventTitle)}</div>
      <div class="meta" style="font-size:18px;">${escapeHtml(data.dateFormatted)}</div>
    </div>
    `
  );
}

/** REMINDER — 1 Tag vorher */
export function renderReminderHtml(data: TemplateData): string {
  const headline = data.daysUntil === 0 ? "HEUTE ABEND" : "MORGEN ABEND";
  const ticket = data.ticketUrl
    ? `<div style="margin-top:24px;font-size:16px;font-weight:600;color:#FFA500;">LETZTE CHANCE!</div>`
    : "";

  return baseHtml(
    data.backgroundImageUrl,
    `
    <div class="title accent" style="font-size:64px;line-height:1.1;margin-bottom:20px;">${headline}</div>
    <div class="title" style="font-size:36px;margin-bottom:20px;">${escapeHtml(data.eventTitle)}</div>
    <div class="divider"></div>
    <div class="meta" style="font-size:18px;margin-bottom:6px;">${escapeHtml(data.timeFormatted)} · ${escapeHtml(data.venue)}</div>
    <div class="meta" style="font-size:16px;color:rgba(255,255,255,0.55);">${escapeHtml(data.city)}</div>
    ${ticket}
    `
  );
}

/** THANKYOU — 1 Tag danach */
export function renderThankyouHtml(data: TemplateData): string {
  return baseHtml(
    data.backgroundImageUrl,
    `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding-bottom:80px;">
      <div class="title" style="font-size:80px;margin-bottom:16px;">DANKE</div>
      <div style="font-weight:600;font-size:24px;color:#FFA500;margin-bottom:24px;">${escapeHtml(data.city)}</div>
      <div class="divider" style="margin:0 auto;"></div>
    </div>
    <div style="text-align:center;">
      <div class="meta" style="font-size:20px;margin-bottom:8px;">${escapeHtml(data.eventTitle)}</div>
      <div class="meta" style="font-size:16px;color:rgba(255,255,255,0.45);">Was für ein Abend!</div>
    </div>
    `
  );
}

/** Dispatcher */
export function getTemplateHtml(template: string, data: TemplateData): string {
  switch (template) {
    case "announcement":
      return renderAnnouncementHtml(data);
    case "countdown":
      return renderCountdownHtml(data);
    case "reminder":
      return renderReminderHtml(data);
    case "thankyou":
      return renderThankyouHtml(data);
    default:
      return renderAnnouncementHtml(data);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
