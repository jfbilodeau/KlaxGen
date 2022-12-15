console.log(`KlaxGen driver loaded`)

function pause (timeout = 1000) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })
}

async function generatePoll (question) {
  const iframe = document.querySelector(`iframe.absolute`)
  const iframeDocument = iframe.contentDocument.documentElement

  let step3Button = null
  do {
    await pause()
    step3Button = iframeDocument.querySelectorAll(`header.m-accordion__header`)[2]
  } while (!step3Button)

  step3Button.click()

  await pause(500)

  const voteButton = iframeDocument.querySelector(`button[data-select-choice-item="poll"]`)
  voteButton.click()

  await pause(500)

  const addVoteButton = iframeDocument.querySelectorAll(`button[data-select-choice-add]`)[1]
  addVoteButton.click()

  await pause(1000)

  const pollField = iframeDocument.querySelector(`#poll_label`)
  pollField.value = question.question.substring(0, 250)

  const createButton = iframeDocument.querySelector(`.m-dialog__button--confirm`)
  createButton.click()

  await pause()

  const addOptionButton = iframeDocument.querySelector(`button[title="add"]`)
  for (let i = 2; i < question.options.length; i++) {
    addOptionButton.click()
    await pause(100)
  }

  for (const index in question.options) {
    const option = question.options[index]
    let selector = index < 2 ? `#poll_choices_${index}_label` : `#poll_choices_answer_${index}_label`
    const optionField = iframeDocument.querySelector(selector)
    optionField.value = option
  }

  const savePollButton = iframeDocument.querySelector(`#poll_valid`)
  savePollButton.click()

  await pause()
}

async function generatePolls (units) {
  for (const unit of units) {
    for (const question of unit.questions)
      await generatePoll(question)
  }
}

async function createSession (options) {
  const title = options.title

  const newButton = document.querySelector(`.floating-btn`)

  newButton.click()

  await pause()
  const sessionButton = document.querySelector(`button[data-qa="menu-meeting"]`)
  sessionButton.click()

  await pause()

  await chrome.runtime.sendMessage({
    action: `execute`,
    keys: `${title}`
  })

  await pause()

  const createButton = document.querySelector(`div.create-btn button`)
  createButton.click()

  await pause()

  await generatePolls(options.units)

  await chrome.runtime.sendMessage({
    action: `done`
  })
}

chrome.runtime.onMessage.addListener(async (request) => {
  switch (request.action) {
    case `createSession`:
      await createSession(request.options)
      break
  }
})