let course = null

function pause (timeout = 1000) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })
}

function showArticle (name) {
  const activities = document.querySelectorAll(`article`)

  activities.forEach((activity) => activity.hidden = true)

  document.getElementById(name).hidden = false
}

function navigateToKlaxoon (e) {
  e.preventDefault()

  chrome.tabs.create({ url: `https://enterprise.klaxoon.com/userspace/studio/manager/activities/` })
}

function displayError (error) {
  showArticle(`error`)

  document.getElementById(`labelErrorMessage`).innerText = error.message

  document.getElementById(`labelErrorDetails`).innerText = error.stack
}

function displayCourseFetchError (courseId, locale) {
  showArticle(`fetchError`)

  document.getElementById(`labelCourseId`).innerText = courseId
  document.getElementById(`labelLocale`).innerText = locale
}

async function getCourse () {
  showArticle(`fetchCourse`)

  const courseId = document.getElementById(`fieldCourseId`).value
  const locale = document.getElementById(`fieldLocale`).value

  const response = await fetch(`https://tools.jfbilodeau.com/kc/generate?courseId=${courseId}&locale=${locale}&format=json&all=true`)

  if (!response.ok) {
    displayCourseFetchError(courseId, locale)
    return
  }

  course = await response.json()

  // Flatten units
  course.units = []

  course.paths.forEach(p => {
    p.modules.forEach(m => {
      course.units.push(...m.units)
    })
  })

  showArticle(`selectUnits`)

  document.getElementById(`fieldSessionTitle`).value = course.title

  const units = []

  for (const path of course.paths) {
    for (const module of path.modules) {
      for (const unit of module.units) {
        if (unit.questions.length) {
          const element = document.createElement(`li`)
          element.innerHTML = `<b>${module.title}</b><br><input type="checkbox" id="${unit.id}"> <label for="${unit.id}">${unit.title}</label>`

          units.push(element)
        }
      }
    }
  }

  const ul = document.getElementById(`selectModules`)
  ul.replaceChildren(...units)
}

async function sendKeys (tab, keys) {
  for (const key of keys) {
    await chrome.debugger.sendCommand({ tabId: tab.id }, `Input.dispatchKeyEvent`, {
      type: `char`,
      text: key,
    })
  }
}

async function sendClick (tab, button, x, y) {
  await chrome.debugger.sendCommand({ tabId: tab.id }, `Input.dispatchMouseEvent`, {
    type: `mousePressed`,
    button,
    x,
    y,
  })

  await pause(100)

  await chrome.debugger.sendCommand({ tabId: tab.id }, `Input.dispatchMouseEvent`, {
    type: `mouseReleased`,
    button,
    x,
    y,
  })
}

async function focus(tab, selector) {
  const document = await chrome.debugger.sendCommand({ tabId: tab.id}, `DOM.getDocument`, {
    depth: -1
  })

  const rootId = document.root.nodeId

  const element = await chrome.debugger.sendCommand({ tabId: tab.id }, `DOM.querySelector`, {
    nodeId: rootId,
    selector,
  })

  const elementId = element.nodeId

  await chrome.debugger.sendCommand({ tabId: tab.id }, `DOM.focus`, {
    nodeId: elementId
  })
}

async function generateKlaxoonSession (script) {
  showArticle(`generate`)

  const warnings = script.warnings.reduce((p, c) => `${p}\n${c}`, ``)

  if (warnings) {
    document.getElementById('labelGenerateWarnings').innerText = warnings
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  await chrome.tabs.update({ url: `https://enterprise.klaxoon.com/userspace/studio/manager/activities/` })

  // var debugTargets = await chrome.debugger.getTargets()
  // if (debugTargets.some(t => t.tabId === tab.id)) {
  //   await chrome.debugger.detach({ tabId: tab.id })
  // }
  await pause()
  await chrome.debugger.attach({ tabId: tab.id }, `1.3`)

  const listener = async message => {
    console.log(message)
    switch (message.action) {
      case `sendKeys`:
        const keys = message.keys
        await sendKeys(tab, keys)
        break

      case `sendClick`:
        await sendClick(tab, message.button, message.x, message.y)
        break

      case `focus`:
        await focus(tab, message.selector)
        break;

      case `done`:
        chrome.runtime.onMessage.removeListener(listener)

        showArticle(`done`)

        await chrome.debugger.detach({ tabId: tab.id })

        window.close()
        break

      case `error`:
        const error = message.error

        console.log(error)

        displayError(error)

        await chrome.debugger.detach({ tabId: tab.id })

        break

      default:
        throw new Error(`Unknown action: ${message.action}`)
    }
  }

  chrome.runtime.onMessage.addListener(listener)

  await pause(2000)

  await chrome.tabs.sendMessage(tab.id, {
    action: 'createSession',
    options: {
      script,
    }
  })
}

async function generateFromCourseId () {
  try {
    const title = document.getElementById(`fieldSessionTitle`).value

    const script = {
      title,
      activities: [],
      warnings: [],
    }

    const checkBoxes = document.querySelectorAll(`#formUnits input[type="checkbox"]`)
    checkBoxes.forEach(e => {
        if (e.checked) {
          const unit = course.units.find(u => u.id === e.id)

          unit.questions.forEach(q => {
            const activity = {
              question: q.question,
              type: `poll`,
              choices: q.options,
              answer: q.answer,
              answerText: q.answerText
            }

            script.activities.push(activity)
          })
        }
      }
    )

    await generateKlaxoonSession(script)
  } catch (e) {
    displayError(e)
  }
}

function compileScript (text) {
  const rawLines = text.split(`\n`).map(l => l.trim())

  const lines = []

  rawLines.forEach(l => {
    if (l === `` || l.startsWith(`#`)) {
      // skip!
    } else
      lines.push(l)
  })

  const script = {
    title: lines.shift(),
    activities: [],
    warnings: [],
  }

  if (script.title.length > 80) {
    script.warnings.push(`The session title is longer than 80 characters. It will be truncated.`)
  }

  let i = 0
  while (i < lines.length) {
    console.log(lines[i])
    const [type, question] = lines[i].split(`:`, 2)

    switch (type) {
      case 'Poll':
      case 'Storm': // Word storm -- aka Cloud
        // Valid question type.
        break;
        
      default:
        throw new Error(`Only 'Poll' or 'Storm' question types are supported on line ${i+1}. Found '${type} instead`)
    }
    
    if (!question) {
      throw new Error(`Question missing after '${type}:' (Make sure your question is on a single line)`)
    }

    console.log(`${type}: ${question}`)

    if (question.length > 250) {
      script.warnings.push(`The following question exceeds 250 characters. It will be truncated. '${question}'`)
    }

    i++

    const activity = {
      type,
      question,
      choices: [],
    }

    if (activity.type === `Poll`) {
      while (i < lines.length && lines[i].startsWith(`-`)) {
        const choice = lines[i].substring(1).trim()

        if (!choice) {
          throw new Error(`Choice missing after dash (-)`)
        }

        activity.choices.push(choice)

        if (choice.length > 250) {
          script.warnings.push(`The following option is longer than 250 characters. It will be truncated. '${choice}'`)
        }

        i++
      }
    }

    script.activities.push(activity)
  }
  return script
}

async function generateFromScript () {
  try {
    const text = document.getElementById(`script`).value

    const script = compileScript(text)

    await generateKlaxoonSession(script)
  } catch (e) {
    displayError(e)
  }
}

async function initialize () {
  document.getElementById(`commandGetCourse`).addEventListener(`click`, getCourse)
  document.getElementById(`commandGenerate`).addEventListener(`click`, generateFromCourseId)
  document.getElementById('commandGenerateKlaxGen').addEventListener(`click`, generateFromScript)

  showArticle(`courseSelect`)
}

await initialize()


