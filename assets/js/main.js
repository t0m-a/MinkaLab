// Minka Lab — Main Interactive JavaScript
document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu Toggle
  const mobileToggle = document.querySelector('.mobile-toggle');
  const navMenu = document.querySelector('nav ul');

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      navMenu.classList.toggle('show');
    });
  }

  // Header transparency & blur effect on scroll
  const header = document.querySelector('header');
  if (header) {
    const handleScroll = () => {
      if (window.scrollY > 15) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // Smooth Scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId !== '#') {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({
            behavior: 'smooth'
          });
        }
      }
    });
  });

  // Formulario de Registro (Súmate / Voluntariado)
  const registroForm = document.getElementById('registro-form');
  if (registroForm) {
    const statusBox = document.getElementById('form-status');
    const submitBtn = document.getElementById('submit-btn');

    registroForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nombre = document.getElementById('nombre').value.trim();
      const contacto = document.getElementById('contacto').value.trim();
      const ubicacion = document.getElementById('ubicacion').value.trim();
      const rol = document.getElementById('rol').value;
      const trap = document.getElementById('website_url_trap')?.value;

      // Validación básica en cliente
      if (!nombre || !contacto) {
        if (statusBox) {
          statusBox.innerHTML = '<div class="alert alert-error">Por favor completa los campos requeridos (Nombre completo y Correo o WhatsApp).</div>';
        }
        return;
      }

      // Estado de carga en la UI
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando registro...';
      }
      if (statusBox) statusBox.innerHTML = '';

      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nombre,
            contacto,
            ubicacion,
            rol,
            website_url_trap: trap,
          }),
        });

        const result = await response.json().catch(() => ({}));
        console.log("Resultado del registro:", result);

        if (response.ok && result.success) {
          if (statusBox) {
            statusBox.innerHTML =
              '<div class="alert alert-success">' +
              '<strong>¡Gracias por sumarte a Minka Lab!</strong><br>' +
              'Tu registro ha sido recibido y almacenado exitosamente. Nos pondremos en contacto contigo a la brevedad vía correo o WhatsApp.' +
              '</div>';
          }
          registroForm.reset();
        } else {
          throw new Error(result.error || 'Ocurrió un error al procesar tu registro en el servidor.');
        }
      } catch (err) {
        if (statusBox) {
          statusBox.innerHTML =
            '<div class="alert alert-error">' +
            '<strong>No se pudo enviar el registro:</strong> ' +
            (err.message || 'Error de conexión.') +
            '<br>Por favor intenta nuevamente en unos momentos o escríbenos a <a href="mailto:contact@minkalab.net">contact@minkalab.net</a>.' +
            '</div>';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar Registro';
        }
      }
    });
  }
});
