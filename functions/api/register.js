/**
 * Cloudflare Pages Function: POST /api/register
 * 
 * 1. Procesa POST /api/register para almacenar registros en D1 y enviar alertas.
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
      console.warn("env.DB no está vinculado en Cloudflare.");
    }

    // 4. Diagnóstico y despacho de Notificaciones
    const notificationResults = {
      telegram: "not_configured",
      resend: "not_configured",
      cloudflare_email: "not_configured",
    };

    const notificationPromises = [];

    // 4.A Telegram Bot
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      notificationResults.telegram = "pending";
      const telegramText =
        `🤝 *Nuevo Registro en Minka Lab*\n\n` +
        `👤 *Nombre:* ${escapeTelegramMarkdown(nombre)}\n` +
        `📱 *Contacto:* ${escapeTelegramMarkdown(contacto)}\n` +
        `📍 *Ubicación:* ${escapeTelegramMarkdown(ubicacion || "No especificada")}\n` +
        `🎯 *Rol / Interés:* ${escapeTelegramMarkdown(rol || "No especificado")}\n` +
        `🕒 *Fecha:* ${escapeTelegramMarkdown(new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }))}\n` +
        `💾 *Guardado en D1:* ${dbSuccess ? "Sí" : "No"}`;

      notificationPromises.push(
        (async () => {
          try {
            const token = env.TELEGRAM_BOT_TOKEN.trim();
            const chatId = env.TELEGRAM_CHAT_ID.trim();
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: telegramText,
                parse_mode: "Markdown",
              }),
            });
            const resText = await res.text();
            if (!res.ok) {
              console.error(`Telegram Error (${res.status}):`, resText);
              notificationResults.telegram = `error_${res.status}: ${resText}`;
            } else {
              console.log("Telegram enviado correctamente:", resText);
              notificationResults.telegram = "sent";
            }
          } catch (telErr) {
            console.error("Excepción al conectar con Telegram:", telErr);
            notificationResults.telegram = `exception: ${telErr.message}`;
          }
        })()
      );
    }

    // 4.B Notificación vía Resend API
    if (env.RESEND_API_KEY) {
      notificationResults.resend = "pending";
      const apiKey = env.RESEND_API_KEY.trim();
      const fromAddress = env.FROM_EMAIL ? env.FROM_EMAIL.trim() : "Minka Lab <notificaciones@minkalab.net>";
      const toAddress = env.NOTIFY_EMAIL ? env.NOTIFY_EMAIL.trim() : "contact@minkalab.net";

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #212529; background-color: #f8f9fa;">
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
              Minka Lab Initiative &bull; <a href="https://minkalab.net" style="color: #00A896;">minkalab.net</a>
            </div>
          </div>
        </div>
      `;

      notificationPromises.push(
        (async () => {
          try {
            console.log(`Enviando email vía Resend desde "${fromAddress}" hacia "${toAddress}"...`);
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromAddress,
                to: [toAddress],
                subject: `[Minka Lab] Nuevo Registro: ${nombre} (${rol})`,
                html: emailHtml,
              }),
            });
            const resBody = await res.text();
            if (!res.ok) {
              console.error(`Resend API Error (HTTP ${res.status}):`, resBody);
              notificationResults.resend = `error_${res.status}: ${resBody}`;
            } else {
              console.log("Resend API éxito:", resBody);
              notificationResults.resend = "sent";
            }
          } catch (resendErr) {
            console.error("Excepción al conectar con Resend:", resendErr);
            notificationResults.resend = `exception: ${resendErr.message}`;
          }
        })()
      );
    } else {
      console.warn("RESEND_API_KEY no encontrada en las variables de entorno de Cloudflare.");
    }

    // 4.C Notificación vía Cloudflare Email Routing binding (si está vinculado send_email)
    if (env.SEND_EMAIL) {
      notificationResults.cloudflare_email = "pending";
      try {
        const { EmailMessage } = await import("cloudflare:email");
        const rawMime = [
          `From: ${env.FROM_EMAIL || "notificaciones@minkalab.net"}`,
          `To: ${env.NOTIFY_EMAIL || "contact@minkalab.net"}`,
          `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(`[Minka Lab] Nuevo Registro: ${nombre}`)))}?=`,
          `Content-Type: text/plain; charset=UTF-8`,
          ``,
          `Nuevo Registro en Minka Lab:`,
          `• Nombre: ${nombre}`,
          `• Contacto: ${contacto}`,
          `• Ubicación: ${ubicacion || 'No especificada'}`,
          `• Rol: ${rol}`,
          `• Fecha: ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`,
        ].join('\r\n');

        const message = new EmailMessage(
          env.FROM_EMAIL || "notificaciones@minkalab.net",
          env.NOTIFY_EMAIL || "contact@minkalab.net",
          rawMime
        );
        notificationPromises.push(
          env.SEND_EMAIL.send(message)
            .then(() => { notificationResults.cloudflare_email = "sent"; })
            .catch((e) => {
              console.error("Error en env.SEND_EMAIL:", e);
              notificationResults.cloudflare_email = `error: ${e.message}`;
            })
        );
      } catch (emailErr) {
        console.warn("No se pudo usar cloudflare:email:", emailErr);
      }
    }

    await Promise.allSettled(notificationPromises);

    return new Response(
      JSON.stringify({
        success: true,
        message: "¡Registro recibido con éxito!",
        saved: dbSuccess,
        notifications: notificationResults,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error general en handleRegister:", error);
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
