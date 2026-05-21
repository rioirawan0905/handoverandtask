export const onRequestPost: PagesFunction = async (context) => {
  try {
    // 1. Ambil data JSON yang dikirim dari frontend
    const data = await context.request.json();
    
    // 2. [Taruh kode logika pengiriman email Anda di sini]
    // Contoh: Integrasi dengan Resend, SendGrid, atau MailChannels
    
    // 3. Kembalikan respons Sukses ke frontend
    return new Response(JSON.stringify({ success: true, message: "Email sent!" }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    });
  }
};