let UNIFIED_API_ENDPOINT;
let BUCKET_NAME;
const s3 = new AWS.S3();

window.addEventListener('load', () => {
    const { verificationURL, bucketName } = getBaseURLs();
    UNIFIED_API_ENDPOINT = verificationURL;
    BUCKET_NAME = bucketName;
    AWS.config.region = "ap-south-1";
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: "ap-south-1:7a8263a8-c022-4670-9496-0beb10382c33"
    });

    updateUsageCounters(); // now runs after config is ready
});

let fileListInterval = null;
let sessionStartTime = new Date(); // Track when the session started
let lastUploadTime = null; // Track when the last upload occurred
let selectedFile = null;
let processingInterval = null;
const PROCESSING_CHECK_INTERVAL = 3000;

async function incrementCounter(counterType) {
    const useremail = localStorage.getItem("useremail");
    const provider_user_id = localStorage.getItem("provider_user_id");
    const token = localStorage.getItem("token");
    try {
        // Prepare the request payload
        const payload = {
            action: "incrementCounter",
            email: useremail,
            counterType: counterType
        };
        // Only add provider_user_id if it exists and is not 'undefined'
        if (provider_user_id && provider_user_id !== 'undefined') {
            payload.provider_user_id = provider_user_id;
        }
        const response = await fetch(UNIFIED_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error('Failed to increment counter');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error incrementing counter:', error);
        throw error;
    }
}

// Function to update the display counters
async function updateUsageCounters() {
    const useremail = localStorage.getItem("useremail");
    const provider_user_id = localStorage.getItem("provider_user_id");
    try {
        // Prepare the request payload
        const payload = {
            action: "checkStatus"
        };
        // Only add email if it's not null
        if (useremail) {
            payload.email = useremail;
        }
        // Only add provider_user_id if it exists and is not 'undefined'
        if (provider_user_id && provider_user_id !== 'undefined') {
            payload.provider_user_id = provider_user_id;
        }
        const response = await fetch(UNIFIED_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            
            // Update counters
            document.getElementById("uploadCountDisplay").textContent = data.uploadCount;
            document.getElementById("queryCountDisplay").textContent = data.queryCount;
            document.getElementById("maxUploads").textContent = data.maxUploads;
            document.getElementById("maxQueries").textContent = data.maxQueries;
            
            // Update subscription status display
            const statusMessage = document.getElementById("statusMessage");
            if (!statusMessage) {
                console.warn("Element with ID 'statusMessage' not found.");
                return;
            }
            if (data.isSubscribed) {
                statusMessage.innerHTML = '<div class="premium-badge"><strong>Premium User:</strong> Unlocked Premium Access</div>';
                if (document.getElementById("remainingCounts")) {
                    document.getElementById("remainingCounts").style.display = 'block';
                    document.getElementById("remainingUploads").textContent = data.remainingUploads;
                    document.getElementById("remainingQueries").textContent = data.remainingQueries;
                }
            } else {
                statusMessage.innerHTML = '<strong>Free Tier Limits:</strong>';
                if (document.getElementById("remainingCounts")) {
                    document.getElementById("remainingCounts").style.display = 'none';
                }
            }
            
            // Show/hide subscribe button
            if (document.getElementById("subscribeButtonContainer")) {
                document.getElementById("subscribeButtonContainer").style.display = 
                    data.isSubscribed ? 'none' : 'block';
            }
        }
    } catch (error) {
        console.error('Error updating usage status:', error);
    }
} 

let previousFileList = []; // Store previous file list to track changes
let processingStarted = false; // Flag to track if processing has started
let uploadedFilename = ""; // Used to track original upload
let uploadTime = null; // Track exact upload timestamp

// Upload File to S3
async function uploadFile() {
    try {
        if (!selectedFile) {
            alert("Please select a file first!");
            return;
        }
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }
        const useremail = localStorage.getItem("useremail");
        const provider_user_id = localStorage.getItem("provider_user_id");

        // Prepare the request payload
        const payload = {
            action: "checkStatus"
        };
        // Only add email if it's not null
        if (useremail) {
            payload.email = useremail;
        }
        // Only add provider_user_id if it exists and is not 'undefined'
        if (provider_user_id && provider_user_id !== 'undefined') {
            payload.provider_user_id = provider_user_id;
        }
        
        // First check limits
        const statusResponse = await fetch(UNIFIED_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify(payload)
        });
        
        const statusData = await statusResponse.json();
        
        if (statusData.uploadCount >= statusData.maxUploads) {
            const tier = statusData.isSubscribed ? 'premium' : 'free';
            const message = `⚠️ You've reached your ${tier} tier limit of ${statusData.maxUploads} uploads.`;
            alert(message);
            return;
        }

        // Check file type (only allow Excel files)
        const allowedExtensions = ['.xls', '.xlsx', '.xlsm', 'csv'];
        const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
        if (!allowedExtensions.includes(fileExtension)) {
            alert("Only Excel files (.xls, .xlsx, .xlsm, csv) are allowed.");
            return;
        }

        // Check file size (limit to 1MB)
        const MAX_SIZE_MB = 1;
        const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;
        if (selectedFile.size > maxSizeBytes) {
            alert("File size exceeds 1 MB. Please upload a smaller file.");
            return;
        }

        uploadedFilename = selectedFile.name; 
        uploadTime = new Date(); // ✅ Capture upload time
        processingStarted = true;

        const uploadStatus = document.getElementById("uploadStatus");
        uploadStatus.innerText = "Uploading...";
        uploadStatus.className = "upload-status uploading";

        
        // Show processing indicator in file list
        showProcessingIndicator(selectedFile.name);
        
        // Start the upload
        const uploadResponse = await s3.upload({
            Bucket: BUCKET_NAME,
            Key: selectedFile.name,
            Body: selectedFile
        }).promise();
            
        // Update counters
        await incrementCounter('uploadCount');
        updateUsageCounters();

        // Update UI for upload success
        uploadStatus.innerText = "Upload Successful!";
        uploadStatus.className = "upload-status uploading";

        // Start checking for processed file
        const fileName = selectedFile.name;
        processingInterval = setInterval(() => checkForProcessedFile(fileName), PROCESSING_CHECK_INTERVAL);

        document.getElementById('fileInput').value = "";
        selectedFile = null;
    } catch (error) {
        console.error("Upload failed:", error);
        const uploadStatus = document.getElementById("uploadStatus");
        uploadStatus.innerText = "Upload Failed!";
        uploadStatus.className = "upload-status error";
        processingStarted = false;
        
        // Clear processing indicator
        clearProcessingIndicator();
        
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }
    }
}

function showProcessingIndicator(filename) {
    const fileListContainer = document.getElementById("fileListContainer");
    const displayText = filename ? `Processing ${filename}` : "Processing";
    
    fileListContainer.innerHTML = `
        <div class="file-row processing">
            <div class="file-processing-info">
                <span class="file-name">${displayText}</span>
                <span class="file-status">Calculating..</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar"></div>
            </div>
        </div>
    `;
    
    // Animate the progress bar (simulated progress)
    const progressBar = fileListContainer.querySelector('.progress-bar');
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
        }
        progressBar.style.width = `${progress}%`;
    }, 500);
}

function clearProcessingIndicator() {
    const fileListContainer = document.getElementById("fileListContainer");
    if (fileListContainer.querySelector('.calculating-text')) {
        fileListContainer.innerHTML = "<div class='no-files'>Processing your file...</div>";
    }
    uploadedFilename = "";
}

async function checkForProcessedFile(originalFilename) {
    try {
        const params = { Bucket: BUCKET_NAME };
        const data = await s3.listObjects(params).promise();
        
        if (!data.Contents) return;
        
        // Look for processed files (Price_ or Error_ prefixed)
        const resultFiles = data.Contents.filter(file => 
            file.Key.startsWith("Price_") || file.Key.startsWith("Error_"));
        
        // Check if any result file matches our upload time (after the upload)
        const relevantFile = resultFiles.find(file => 
            new Date(file.LastModified) > uploadTime);
        
        if (relevantFile) {
            // Found a processed file - stop checking and refresh the list
            if (processingInterval) {
                clearInterval(processingInterval);
                processingInterval = null;
            }
            
            const uploadStatus = document.getElementById("uploadStatus");
            if (relevantFile.Key.startsWith("Error_")) {
                uploadStatus.innerText = "Processing Failed!";
                uploadStatus.className = "upload-status error";
            } else {
                uploadStatus.innerText = "Processing Complete!";
                uploadStatus.className = "upload-status success";
            }
            
            processingStarted = false;
            listFiles(); // Refresh the file list
        }
    } catch (error) {
        console.error("Error checking for processed file:", error);
    }
}

function updateUsageDisplay(counterData) {
    document.getElementById("uploadCountDisplay").textContent = counterData.uploadCount;
    document.getElementById("queryCountDisplay").textContent = counterData.queryCount;
    
    // Update remaining counts display if you have those elements
    if (document.getElementById("remainingUploads")) {
        document.getElementById("remainingUploads").textContent = counterData.remainingUploads;
    }
    if (document.getElementById("remainingQueries")) {
        document.getElementById("remainingQueries").textContent = counterData.remainingQueries;
    }
}

// List Files in S3 and detect new files
function listFiles() {
    // If there's no upload time (no recent upload), don't list files
    if (!uploadTime) {
        const fileListContainer = document.getElementById("fileListContainer");
        fileListContainer.innerHTML = "<div class='no-files'>Upload a file to see results</div>";
        return;
    }

    let params = { Bucket: BUCKET_NAME };
    s3.listObjects(params, function(err, data) {
        if (err) {
            alert("Error fetching files: " + err.message);
            return;
        }
        
        const fileListContainer = document.getElementById("fileListContainer");
        
        // If still processing, keep showing the processing indicator
        if (processingStarted && uploadedFilename) {
            showProcessingIndicator(uploadedFilename);
            return;
        }
        
        fileListContainer.innerHTML = "";
        
        if (!data.Contents || data.Contents.length === 0) {
            fileListContainer.innerHTML = "<div class='no-files'>No files available</div>";
            return;
        }

        // Sort files by last modified date (newest first)
        const sortedFiles = data.Contents.sort((a, b) => 
            new Date(b.LastModified) - new Date(a.LastModified));

        // Filter for result files (Price_ or Error_)
        const resultFiles = sortedFiles.filter(file => 
            (file.Key.startsWith("Price_") || file.Key.startsWith("Error_")) &&
            new Date(file.LastModified) >= uploadTime);

        // Display the latest result file
        if (resultFiles.length > 0) {
            const latestFile = resultFiles[0];
            const isError = latestFile.Key.startsWith("Error_");
            
            const fileRow = document.createElement("div");
            fileRow.className = "file-row";
            
            const fileNameSpan = document.createElement("span");
            fileNameSpan.textContent = latestFile.Key;
            fileNameSpan.className = "file-name";
            
            const downloadBtn = document.createElement("button");
            downloadBtn.className = "download-btn";
            downloadBtn.innerHTML = `<img src="assets/images/download-xls.svg" class="button-icon">XLS`;
            downloadBtn.onclick = () => downloadFileDirect(latestFile.Key);
            
            const statusSpan = document.createElement("span");
            statusSpan.className = "file-status";
            statusSpan.textContent = isError ? "Error" : "Ready";
            statusSpan.style.color = isError ? "red" : "green";
            
            fileRow.appendChild(fileNameSpan);
            fileRow.appendChild(statusSpan);
            fileRow.appendChild(downloadBtn);
            
            fileListContainer.appendChild(fileRow);
        } else {
            fileListContainer.innerHTML = "<div class='no-files'>No result files available</div>";
        }
    });
}

// Update the downloadFileDirect function
function downloadFileDirect(fileKey) {
    const params = {
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Expires: 60 // URL expires in 60 seconds
    };
    
    s3.getSignedUrlPromise('getObject', params)
        .then(url => {
            // Create a temporary anchor element to trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = fileKey;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
            }, 100);
        })
        .catch(err => {
            console.error("Error generating download URL:", err);
            alert("Error generating download link: " + err.message);
        });
}

// For the main download button (if you want to keep it)
function downloadSelectedFile() {
    const fileRows = document.querySelectorAll(".file-row");
    if (fileRows.length === 0) {
        alert("No files available to download!");
        return;
    }
    
    // Download the first (most recent) file by default
    const fileName = fileRows[0].querySelector("span").textContent;
    downloadFileDirect(fileName);
}

// **Clear status message when user selects a file from dropdown**
document.getElementById("fileListContainer").addEventListener("change", function () {
    document.getElementById("uploadStatus").innerText = "";
});

function clearFileList() {
    // Stop the automatic file list refresh
    if (fileListInterval) {
        clearInterval(fileListInterval);
        fileListInterval = null;
    }
    
    const fileListContainer = document.getElementById("fileListContainer");
    if (fileListContainer) {
        fileListContainer.innerHTML = "<div class='no-files'>No files available</div>";
    }
    
    // Clear all file-related state
    uploadedFilename = "";
    selectedFile = null;
    previousFileList = [];
    
    // Clear UI elements
    const selectedFileNameElement = document.getElementById('selectedFileName');
    if (selectedFileNameElement) {
        selectedFileNameElement.textContent = "";
    }
    
    const uploadStatusElement = document.getElementById("uploadStatus");
    if (uploadStatusElement) {
        uploadStatusElement.innerText = "";
        uploadStatusElement.className = "upload-status";
    }
    
    // Clear file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = "";
    }
    
    // Clear any processing intervals
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }
    processingStarted = false;
}

window.onload = function () {
    // Clear any existing intervals
    if (fileListInterval) {
        clearInterval(fileListInterval);
    }
    if (processingInterval) {
        clearInterval(processingInterval);
    }
    updateUsageCounters();
    uploadedFilename = ""; // Clear on first load
    clearFileList();
    // Set up periodic file list refresh only if user is logged in
    if (localStorage.getItem("token")) {
        fileListInterval = setInterval(listFiles, 5000);
    }
    document.getElementById('fileInput').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            document.getElementById('selectedFileName').textContent = `Selected: ${selectedFile.name}`;
        }
    });
};