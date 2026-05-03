

async function testAudit() {
  try {
    const res = await fetch('http://localhost:3000/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: 'https://scryai.com', 
        analyzeDomainInfrastructure: true 
      })
    });
    
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      console.log(JSON.stringify(data.robots, null, 2));
    } catch (e) {
      console.log('Response was not JSON:', text.substring(0, 500));
    }
  } catch (e) {
    console.error(e);
  }
}

testAudit();
