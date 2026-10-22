/**
 * Cloudflare Pages Function: POST /api/register
 * 
 * Procesa las solicitudes del Formulario de Registro (Súmate / Voluntariado):
 * 1. Filtra envíos de spam mediante trampa Honeypot.
 * 2. Valida los campos obligatorios.
 * 3. Registra y almacena la información en Cloudflare D1 (env.DB).
 * 4. Envía notificación inmediata vía:
 *    - Bot de Telegram (env.TELEGRAM_BOT_TOKEN & env.TELEGRAM_CHAT_ID)
 *    - Cloudflare Email Routing binding (env.SEND_EMAIL)
 *    - API de Resend (env.RESEND_API_KEY)
 */

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const data = await request.json();

    // 1. Detección Anti-Spam (Honeypot)
    // Los robots completan campos ocultos automáticamente. Si tiene contenido,
    // respondemos 200 OK silenciosamente sin guardar ni alertar.
    if (data.website_url_trap && data.website_url_trap.trim() !== "") {
      return new Response(JSON.stringify({ success: true, message: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const nombre = (data.nombre || "").trim();
    const contacto = (data.contacto || "").trim();
    const ubicacion = (data.ubicacion || "").trim();
    const rol = (data.rol || "").trim();

    // 2. Validación de campos obligatorios
    if (!nombre || !contacto) {
      return new Response(
        JSON.stringify({ error: "Nombre y datos de contacto son obligatorios." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const clientIp = request.headers.get("cf-connecting-ip") || "Desconocida";
    const userAgent = request.headers.get("user-agent") || "Desconocido";
    const fechaHora = new Date().toISOString();

    // 3. Almacenamiento en Cloudflare D1
    let dbSuccess = false;
    let dbErrorMsg = null;

    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO registros (nombre, contacto, ubicacion, rol, ip, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(nombre, contacto, ubicacion, rol, clientIp, userAgent, fechaHora)
          .run();
        dbSuccess = true;
      } catch (dbErr) {
        dbErrorMsg = dbErr.message;
        console.error("Error al insertar en D1:", dbErr);
      }
    } else {
      console.warn("env.DB no está vinculado en las opciones de Cloudflare Pages.");
    }

    // 4. Despacho de Notificaciones (Telegram / Email)
    const notificationPromises = [];

    // 4.A Notificación vía Telegram (Notificación instantánea a celular)
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const telegramText =
        `🤝 *Nuevo Registro en Minka Lab*\n\n` +
        `👤 *Nombre:* ${escapeTelegramMarkdown(nombre)}\n` +
        `📱 *Contacto:* ${escapeTelegramMarkdown(contacto)}\n` +
        `📍 *Ubicación:* ${escapeTelegramMarkdown(ubicacion || "No especificada")}\n` +
        `🎯 *Rol / Interés:* ${escapeTelegramMarkdown(rol || "No especificado")}\n` +
        `🕒 *Fecha:* ${escapeTelegramMarkdown(new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }))}\n` +
        `💾 *Guardado en D1:* ${dbSuccess ? "Sí" : (dbErrorMsg ? `Error (${escapeTelegramMarkdown(dbErrorMsg)})` : "Pendiente binding")}`;

      notificationPromises.push(
        fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: telegramText,
            parse_mode: "Markdown",
          }),
        }).catch((err) => console.error("Error al enviar notificación a Telegram:", err))
      );
    }

    // 4.B Notificación vía Resend API (si está configurada la API key)
    if (env.RESEND_API_KEY) {
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #212529; background-color: #f8f9fa; border-radius: 8px;">
          <div style="background-color: #ffffff; padding: 24px; border-radius: 6px; border-left: 4px solid #C85A32; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <h2 style="color: #C85A32; margin-top: 0;">Nuevo Registro en Súmate / Voluntariado</h2>
            <p>Se ha recibido una nueva solicitud a través del sitio web:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 10px 0; font-weight: 600; width: 140px;">Nombre:</td><td>${escapeHtml(nombre)}</td></tr>
              <tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 10px 0; font-weight: 600;">Contacto:</td><td>${escapeHtml(contacto)}</td></tr>
              <tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 10px 0; font-weight: 600;">Ubicación:</td><td>${escapeHtml(ubicacion || "No especificada")}</td></tr>
              <tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 10px 0; font-weight: 600;">Rol de Interés:</td><td>${escapeHtml(rol || "No especificado")}</td></tr>
              <tr><td style="padding: 10px 0; font-weight: 600;">Guardado en D1:</td><td>${dbSuccess ? "✅ Exitoso" : "⚠️ Error / No configurado"}</td></tr>
            </table>

            <div style="margin-top: 24px; font-size: 0.85rem; color: #6c757d; border-top: 1px solid #e9ecef; padding-top: 12px;">
              Minka Lab Initiative — Plataforma Web Comunitaria &bull; <a href="https://minkalab.net" style="color: #00A896;">minkalab.net</a>
            </div>
          </div>
        </div>
      `;

      notificationPromises.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: env.FROM_EMAIL || "Minka Lab <notificaciones@minkalab.net>",
            to: [env.NOTIFY_EMAIL || "contact@minkalab.net"],
            subject: `[Minka Lab] Nuevo Registro: ${nombre} (${rol})`,
            html: emailHtml,
          }),
        }).catch((err) => console.error("Error al enviar email vía Resend:", err))
      );
    }

    // 4.C Notificación vía Cloudflare Email Routing binding (si está vinculado send_email)
    if (env.SEND_EMAIL) {
      try {
        const { EmailMessage } = await import("cloudflare:email");
        const rawMime = [
          `From: ${env.FROM_EMAIL || "notificaciones@minkalab.net"}`,
          `To: ${env.NOTIFY_EMAIL || "contact@minkalab.net"}`,
          `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(`[Minka Lab] Nuevo Registro: ${nombre}`)))}?=`,
          `Content-Type: text/plain; charset=UTF-8`,
          ``,
          `Nuevo Registro en Minka Lab (Súmate / Voluntariado):`,
          ``,
          `• Nombre: ${nombre}`,
          `• Contacto (Email o WhatsApp): ${contacto}`,
          `• Ubicación: ${ubicacion || 'No especificada'}`,
          `• Rol de Interés: ${rol}`,
          `• Fecha: ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`,
          `• Guardado en D1: ${dbSuccess ? "Sí" : "No"}`,
        ].join('\r\n');

        const message = new EmailMessage(
          env.FROM_EMAIL || "notificaciones@minkalab.net",
          env.NOTIFY_EMAIL || "contact@minkalab.net",
          rawMime
        );
        notificationPromises.push(
          env.SEND_EMAIL.send(message).catch((e) => console.error("Error en env.SEND_EMAIL:", e))
        );
      } catch (emailErr) {
        console.warn("No se pudo cargar o enviar con cloudflare:email:", emailErr);
      }
    }

    // Aguardar las notificaciones en paralelo sin bloquear la respuesta si alguna falla
    await Promise.allSettled(notificationPromises);

    return new Response(
      JSON.stringify({
        success: true,
        message: "¡Registro recibido con éxito!",
        saved: dbSuccess,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error general en POST /api/register:", error);
    return new Response(
      JSON.stringify({ error: "Ocurrió un error al procesar el registro." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function escapeTelegramMarkdown(str) {
  return (str || "").replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
