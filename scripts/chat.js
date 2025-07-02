// Call it when the page loads
document.addEventListener('DOMContentLoaded', function() {
    updateUsageCounters();
});

document.getElementById("userInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        sendMessage();
        clearInput(); // Clear input after sending
    }
});

// Add click event listener for the send button
document.querySelector(".chat-input button").addEventListener("click", function() {
    sendMessage();
    clearInput(); // Clear input after sending
});

// Function to clear the input field
function clearInput() {
    document.getElementById("userInput").value = "";
}

const provider_user_id = localStorage.getItem("provider_user_id");

// Update the message display functions
function displayUserMessage(message) {
    const messagesDiv = document.getElementById("messages");
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", "user-message");
    
    messageElement.innerHTML = `
        <div class="message-header">You</div>
        <div class="message-content">${message}</div>
        <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    messagesDiv.appendChild(messageElement);
    scrollToBottom();
}

function displayBotMessage(message, isEstimate = false) {
    const messagesDiv = document.getElementById("messages");
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", "bot-message");
    
    if (isEstimate) {
        messageElement.innerHTML = `
            ${message}
            <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="message-content">${message}</div>
            <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
    }
    
    messagesDiv.appendChild(messageElement);
    scrollToBottom();
}

// Add these functions to show/hide typing indicator
function showTypingIndicator() {
    const typingElement = document.getElementById('typingIndicator');
    typingElement.style.display = 'flex';
    scrollToBottom(); // Make sure it's visible
}

function hideTypingIndicator() {
    const typingElement = document.getElementById('typingIndicator');
    typingElement.style.display = 'none';
}

// Update the sendMessage function to use these new display functions
async function sendMessage() {
    const useremail = localStorage.getItem("useremail");
    const userInput = document.getElementById("userInput").value.trim();
    if (!userInput) return;

    try {
        // Prepare the request payload
        const statusPayload = {
            action: "checkStatus"
        };
        // Only add email if it's not null
        if (useremail) {
            statusPayload.email = useremail;
        }
        // Only add provider_user_id if it exists and is not 'undefined'
        if (localStorage.getItem("provider_user_id") && localStorage.getItem("provider_user_id") !== 'undefined') {
            statusPayload.provider_user_id = localStorage.getItem("provider_user_id");
        }
        // First check limits
        const statusResponse = await fetch(UNIFIED_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(statusPayload)
        });
        
        const statusData = await statusResponse.json();
        
        if (statusData.queryCount >= statusData.maxQueries) {
            const tier = statusData.isSubscribed ? 'premium' : 'free';
            const message = `⚠️ You've reached your ${tier} tier limit of ${statusData.maxQueries} queries.`;
            alert(message);
            return;
        }
        
        // Display usage info for all users
        if (statusData.queryCount === statusData.maxQueries) {
            const tier = isSubscribed ? 'premium' : 'free';
            const message = '⚠️ This is your last query in your ' + tier + ' tier limit of ' + maxQueries + ' queries.';
            alert(message);
        }

        // Display user message
        displayUserMessage(userInput);

        // Show typing indicator
        showTypingIndicator();
    
        // Increment counter
        const provider_user_id = localStorage.getItem("provider_user_id");
        // Prepare the request payload
        const payload2 = {
            action: "incrementCounter",
            email: useremail,
            counterType: "queryCount"
        };
        // Only add provider_user_id if it exists and is not 'undefined'
        if (localStorage.getItem("provider_user_id") && localStorage.getItem("provider_user_id") !== 'undefined') {
            payload2.provider_user_id = localStorage.getItem("provider_user_id");
        }
        const counterResponse = await fetch(UNIFIED_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(payload2)
        });
        
        const counterData = await counterResponse.json();
        updateUsageDisplay(counterData);

        const payload = JSON.stringify({ body: JSON.stringify({ query: userInput }) });

        try {
            let response = await fetch("https://wncxw70jjc.execute-api.ap-south-1.amazonaws.com/prod/pricing-chatbot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
            });

            // Hide typing indicator before showing response
            hideTypingIndicator();

            let responseData = await response.json();

            if (responseData.body) {
                let parsedBody = JSON.parse(responseData.body);

                if (parsedBody.cost_estimate && Array.isArray(parsedBody.cost_estimate) && parsedBody.cost_estimate.length > 0) {
                    parsedBody.cost_estimate.forEach((estimate, index) => {
                        let formattedResponse = `
                            <b>Server ${index + 1} Estimate:</b>
                            <div style="margin-top: 10px; margin-bottom: 10px; overflow-x: auto;">
                                <table class="estimate-table">
                                    <thead>
                                        <tr>
                                            <th>Parameter</th>
                                            <th>Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr><td>Instance Type</td><td>${estimate.InstanceType}</td></tr>
                                        <tr><td>Operating System</td><td>${estimate.OS}</td></tr>
                                        <tr><td>Region</td><td>${estimate.Region}</td></tr>
                                        <tr><td>Storage</td><td>${estimate.Storage}</td></tr>
                                        <tr><td>Database</td><td>${estimate.Database === "No" ? "No Database" : estimate.Database}</td></tr>
                                        <tr><td>On-demand Monthly Server Cost</td><td>${estimate["Monthly Server Cost"]}</td></tr>
                                        <tr><td>Monthly Storage Cost</td><td>${estimate["Monthly Storage Cost"]}</td></tr>
                                        <tr><td>Monthly Database Cost</td><td>${estimate["Monthly Database Cost"]}</td></tr>
                                        <tr class="total-row">
                                            <td>Total Monthly Pricing</td>
                                            <td>${estimate["Total Monthly Pricing"]}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        `;
                        displayBotMessage(formattedResponse, true);
                    });
                } else {
                    displayBotMessage("Error processing cost estimate.");
                }
            } else {
                displayBotMessage("Invalid response from server.");
            }
        } catch (error) {
            displayBotMessage("Request failed.");
        }
    } catch (error) {
        console.error("Error in sendMessage:", error);
        displayBotMessage("Error processing your request");
    }

    scrollToBottom();  // Auto-scroll after chatbot response
    clearInput();
}

function scrollToBottom() {
    let chatbox = document.getElementById("chatbox");
    chatbox.scrollTop = chatbox.scrollHeight;
}