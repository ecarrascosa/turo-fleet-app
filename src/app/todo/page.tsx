export default function TodoPage() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>To-Do — Tuesday May 5</title>
      </head>
      <body style={{ fontFamily: '-apple-system, sans-serif', maxWidth: 500, margin: '20px auto', padding: '0 16px', color: '#1a1a1a' }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>📋 To-Do — Tuesday May 5</h1>

        <h2 style={{ fontSize: 15, color: '#555', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <span style={{ background: '#2563eb', color: 'white', display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>9:00 AM</span>
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Check-in Mazda CX-30</li>
        </ul>

        <h2 style={{ fontSize: 15, color: '#555', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Clean &amp; Checkout <span style={{ color: '#888', fontSize: 13 }}>(Lower Pac Heights)</span>
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ RAV4</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Jeep Cherokee</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Black Corolla 2019</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ White Corolla 2025</li>
        </ul>

        <h2 style={{ fontSize: 15, color: '#555', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Clean &amp; Checkout <span style={{ color: '#888', fontSize: 13 }}>(other locations)</span>
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Blue Jetta</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Gray Elantra</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ White Jetta</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Audi A4</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Corolla 2022</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Jeep Wrangler</li>
        </ul>

        <h2 style={{ fontSize: 15, color: '#555', margin: '18px 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Other</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Oil change — Blue Jetta</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 15 }}>☐ Bring Passat to Danny at Audio Dimensions</li>
        </ul>
      </body>
    </html>
  );
}
