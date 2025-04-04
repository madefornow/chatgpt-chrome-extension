// Store tab data
let tabsData = []
const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
// Hardcoded API key - no need to prompt the user
const apiKey =
  ""

// Collect data from all open tabs when popup opens
async function collectTabData() {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const tabInfo = tabs.map((tab) => ({
        id: tab.id,
        title: tab.title || "",
        url: tab.url || "",
      }))
      resolve(tabInfo)
    })
  })
}

// Function to query ChatGPT about the tabs
async function queryTabs(userQuery) {
  try {
    // Show loading indicator
    document.getElementById("loading-indicator").classList.remove("hidden")

    // Prepare the data to send to OpenAI
    const prompt = `
I have the following browser tabs open:

${tabsData.map((tab, index) => `${index + 1}. ${tab.title} (${tab.url})`).join("\n")}

User query: "${userQuery}"

Please respond to the user's query about these tabs. If the query is asking to find specific tabs, 
include the tab numbers in your response. Be concise but helpful.

IMPORTANT: If the user is asking to find or open a specific tab, identify the most relevant tab number 
and include "OPEN_TAB: X" at the end of your response (where X is the tab number).
`

    // Call the OpenAI API
    const response = await fetch(OPENAI_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that helps users find and understand their open browser tabs.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content.trim()

    // Check if we should automatically open a tab
    const tabToOpen = findTabToOpen(content, userQuery)

    if (tabToOpen !== null) {
      // Display a brief message before opening the tab
      displayOpeningMessage(tabToOpen, content)

      // Open the tab after a short delay so the user can see the message
      setTimeout(() => {
        openTab(tabToOpen)
      }, 800)
    } else {
      // If no tab to open, just display the response
      displayResponse(content, userQuery)
    }

    return content
  } catch (error) {
    console.error("Error querying tabs:", error)
    displayError(error.message)
    return null
  } finally {
    // Hide loading indicator
    document.getElementById("loading-indicator").classList.add("hidden")
  }
}

// Function to find which tab to open based on the response and query
function findTabToOpen(content, query) {
  // Check for explicit OPEN_TAB instruction
  const openTabMatch = content.match(/OPEN_TAB:\s*(\d+)/i)
  if (openTabMatch) {
    const tabNumber = Number.parseInt(openTabMatch[1]) - 1 // Convert to 0-based index
    if (tabNumber >= 0 && tabNumber < tabsData.length) {
      return tabNumber
    }
  }

  // Check for numbered list items if the query contains "open" or "find"
  if (query.toLowerCase().includes("open") || query.toLowerCase().includes("find")) {
    // Look for the first numbered item in the response
    const listItemMatch = content.match(/(\d+)\.\s+/)
    if (listItemMatch) {
      const tabNumber = Number.parseInt(listItemMatch[1]) - 1
      if (tabNumber >= 0 && tabNumber < tabsData.length) {
        return tabNumber
      }
    }

    // Check for tab references in the format "Tab X" or "#X"
    const tabRegex = /\b(Tab|tab) (\d+)\b|#(\d+)\b/
    const tabMatch = content.match(tabRegex)
    if (tabMatch) {
      const tabNumber = Number.parseInt(tabMatch[2] || tabMatch[3]) - 1
      if (tabNumber >= 0 && tabNumber < tabsData.length) {
        return tabNumber
      }
    }
  }

  return null
}

// Function to open a tab
function openTab(tabIndex) {
  if (tabIndex >= 0 && tabIndex < tabsData.length) {
    const tabId = tabsData[tabIndex].id
    chrome.tabs.update(tabId, { active: true }, () => {
      // Close the popup after opening the tab
      window.close()
    })
  }
}

// Function to display a message that we're opening a tab
function displayOpeningMessage(tabIndex, content) {
  const container = document.getElementById("results-container")
  const tabTitle = tabsData[tabIndex].title
  const shortTitle = tabTitle.length > 40 ? tabTitle.substring(0, 40) + "..." : tabTitle

  // Remove any OPEN_TAB instructions from the content
  const cleanContent = content.replace(/OPEN_TAB:\s*\d+/i, "").trim()

  container.innerHTML = `
    <div class="text-center py-3">
      <div class="mb-2">
        <div class="inline-block rounded-full bg-blue-100 p-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>
      <div class="font-medium text-gray-800">Opening tab:</div>
      <div class="text-blue-600 font-medium">${shortTitle}</div>
      <div class="text-sm text-gray-500 mt-2">Tab ${tabIndex + 1} of ${tabsData.length}</div>
    </div>
  `
}

// Function to display the ChatGPT response
function displayResponse(content, query) {
  const container = document.getElementById("results-container")

  // Create a div for the query
  const queryDiv = document.createElement("div")
  queryDiv.className = "mb-2"
  queryDiv.innerHTML = `<div class="font-semibold text-gray-700">You asked:</div>
                        <div class="pl-2 text-gray-800">${query}</div>`

  // Remove any OPEN_TAB instructions from the displayed content
  const cleanContent = content.replace(/OPEN_TAB:\s*\d+/i, "").trim()

  // Create a div for the response
  const responseDiv = document.createElement("div")
  responseDiv.className = "mb-4"
  responseDiv.innerHTML = `<div class="font-semibold text-gray-700">Response:</div>
                           <div class="pl-2 text-gray-800 whitespace-pre-line">${cleanContent}</div>`

  // Clear previous results and add new ones
  container.innerHTML = ""
  container.appendChild(queryDiv)
  container.appendChild(responseDiv)
}

// Function to display error messages
function displayError(message) {
  const container = document.getElementById("results-container")
  container.innerHTML = `<div class="text-red-500">Error: ${message}</div>
                         <div class="text-sm mt-2">
                           There was a problem connecting to the OpenAI API. If you're seeing rate limit errors, 
                           wait a few minutes before trying again.
                         </div>`
}

// Initialize the extension when the popup is opened
document.addEventListener("DOMContentLoaded", async () => {
  // Collect tab data when popup opens
  tabsData = await collectTabData()

  // Handle search form submission
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault()
    const query = document.getElementById("search-input").value.trim()
    if (query) {
      queryTabs(query)
    }
  })
})

