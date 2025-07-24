let mergedEstimates = [];
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
                    mergedEstimates = [];
                    parsedBody.cost_estimate.forEach((estimate) => {
                        mergedEstimates.push(estimate);
                    });

                    // Generate the merged table only after all queries
                    let tableRows = [
                        "InstanceType", "OS", "Region", "Storage", "Database",
                        "Recommended Volume Type", "Estimated IOPS",
                        "On-demand Monthly Server Cost",
                        "Monthly EC2 Instance Saving Plan Cost (for 3 years, no upfront)",
                        "EC2 Instance Saving Plan Cost (for 3 years, no upfront)",
                        "Monthly EBS Volume Cost",
                        "Monthly Data Transfer Cost",
                        "Total Monthly Pricing (for on-demand)",
                        "Total Monthly Pricing (for 3 years, no upfront ec2 saving plan)"
                    ];

                    let mergedTable = `<b>Cost Estimate:</b><div style="overflow-x:auto;"><table class="estimate-table"><thead><tr><th>Parameter</th>`;

                    mergedEstimates.forEach((_, i) => {
                        mergedTable += `<th>Query ${i + 1}</th>`;
                    });

                    mergedTable += `</tr></thead><tbody>`;

                    tableRows.forEach((row) => {
                        const isBoldRow = row === "Total Monthly Pricing (for on-demand)" ||
                                        row === "Total Monthly Pricing (for 3 years, no upfront ec2 saving plan)";
                        
                        if (isBoldRow) {
                            mergedTable += `<tr><td><b>${row}</b></td>`;
                            mergedEstimates.forEach(est => {
                                let val = est[row] || "N/A";
                                mergedTable += `<td><b>${val}</b></td>`;
                            });
                            mergedTable += `</tr>`;
                        } else {
                            mergedTable += `<tr><td>${row}</td>`;
                            mergedEstimates.forEach(est => {
                                let val = est[row] || "N/A";
                                mergedTable += `<td>${val}</td>`;
                            });
                            mergedTable += `</tr>`;
                        }
                    });

                    mergedTable += `</tbody></table></div>`;
                    displayBotMessage(mergedTable, true);

                } else {
                    displayBotMessage("Error processing cost estimate.");
                }
            } else {
                displayBotMessage("Invalid response from server.");
            }
        } catch (error) {
            console.error("Fetch request failed:", error);
            hideTypingIndicator();
            displayBotMessage("Request failed.");
        }
    } catch (error) {
        console.error("Error in sendMessage:", error);
        hideTypingIndicator();
        displayBotMessage("Error processing your request");
    }

    scrollToBottom();  // Auto-scroll after chatbot response
    clearInput();
}

function scrollToBottom() {
    let chatbox = document.getElementById("chatbox");
    chatbox.scrollTop = chatbox.scrollHeight;
}