// Test script for ticket generation
require('dotenv').config();
const fs = require('fs');
const { generateTickets } = require('./index.js');

async function testTicketGeneration() {
  try {
    // Read the test input
    const transcription = fs.readFileSync('./test-input.txt', 'utf8');
    console.log('Test transcription:', transcription);
    
    // Generate tickets
    console.log('Generating tickets...');
    const tickets = await generateTickets(transcription);
    
    if (!tickets || tickets.length === 0) {
      console.log('No tickets generated.');
    } else {
      console.log('Generated tickets:');
      tickets.forEach((ticket, i) => console.log(`   ${i + 1}. ${ticket}`));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testTicketGeneration(); 