console.log(`KlaxGen driver loaded`)

function pause (timeout = 1000) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })
}

async function getElement (selector, document = window.document, index = 0, timeout = 5000) {
  return (await getAllElements(selector, document, timeout))[index]
}

async function getAllElements (selector, document = window.document, timeout = 5000) {
  const startTime = Date.now()

  let element = null
  do {
    element = document.querySelectorAll(selector)

    if (element.length === 0) {
      if (Date.now() > startTime + timeout) {
        console.log(`Time out querying '${selector}'`)

        throw new Error(`Getting element '${selector}' timed out after ${timeout}ms`)
      }

      await pause(100)
    }
  } while (element.length === 0)

  return element
}

async function click (selector, document = window.document, index = 0, timeout = 5000) {
  const button = await getElement(selector, document, index, timeout)

  button.click()
}

async function generatePoll (activity) {
  const iframe = await getElement(`iframe.absolute`)
  const iframeDocument = iframe.contentDocument.documentElement

  await click(`.m-accordion__header`, iframeDocument, 2)

  await pause()

  await click(`#session-klaxes-poll`, iframeDocument)

  await click(`button[data-select-choice-add]`, iframeDocument, 1)

  const pollField = await getElement(`#poll_label`, iframeDocument)
  pollField.value = activity.question.substring(0, 250)

  await click(`.m-dialog__button--confirm`, iframeDocument)

  const addOptionButton = await getElement(`[data-action-form-collection-add]`, iframeDocument)
  for (let i = 2; i < activity.choices.length; i++) {
    await pause(100)
    addOptionButton.click()
  }

  for (const index in activity.choices) {
    const option = activity.choices[index]
    let selector = index < 2 ? `#poll_choices_${index}_label` : `#poll_choices_answer_${index}_label`
    const optionField = await getElement(selector, iframeDocument)
    optionField.value = option
  }

  await click(`#poll_valid`, iframeDocument)
}

async function generatePolls (script) {
  for (const activity of script.activities) {
    await generatePoll(activity)
    await pause()
  }
}

async function done () {
  await chrome.runtime.sendMessage({
    action: `done`
  })
}

async function reportError (error) {
  await chrome.runtime.sendMessage({
    action: `error`,
    error: {  // Need to manually stringify Error
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  })
}

async function createSession (options) {
  try {
    const script = options.script

    await click(`.floating-btn`)

    await click(`button[data-qa="menu-meeting"]`)

    await chrome.runtime.sendMessage({
      action: `focus`,
      selector: `input[aria-label='Session name']`,
    })

    await pause(100)

    await chrome.runtime.sendMessage({
      action: `sendKeys`,
      keys: `\t\t${script.title}`
    })

    console.log(`Keys sent!`)

    await pause()

    await click(`div.create-btn button`)

    await generatePolls(script)

    await done()
  } catch (e) {
    await reportError(e)
  }
}

chrome.runtime.onMessage.addListener(async (request) => {
  console.log(request)
  switch (request.action) {
    case `createSession`:
      await createSession(request.options)
      break
  }
})