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

  console.log(`showing ${name}`)

  document.getElementById(name).hidden = false
}

function navigateToKlaxoon (e) {
  e.preventDefault()

  chrome.tabs.create({ url: `https://enterprise.klaxoon.com/userspace/studio/manager/activities/` })
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

async function sendKeys (keys, tab) {
  console.log(`Executing: ${keys}`)
  for (const key of keys) {
    // console.log(`Sending: ${key}`)
    await chrome.debugger.sendCommand({ tabId: tab.id }, `Input.dispatchKeyEvent`, {
      type: `char`,
      text: key,
    })
  }
}

async function generateKlaxoonSession (script) {
  showArticle(`generate`)

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  await chrome.tabs.update({ url: `https://enterprise.klaxoon.com/userspace/studio/manager/activities/` })

  // var debugTargets = await chrome.debugger.getTargets()
  // if (debugTargets.some(t => t.tabId === tab.id)) {
  //   await chrome.debugger.detach({ tabId: tab.id })
  // }
  await pause()
  await chrome.debugger.attach({ tabId: tab.id }, `1.3`)

  const listener = async message => {
    switch (message.action) {
      case `sendKeys`:
        const keys = message.keys
        await sendKeys(keys, tab)
        break
      case `done`:
        chrome.runtime.onMessage.removeListener(listener)

        showArticle(`done`)

        await chrome.debugger.detach({ tabId: tab.id })

        window.close()
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
  const title = document.getElementById(`fieldSessionTitle`).value

  const script = {
    title,
    activities: []
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
  }

  let i = 0
  while (i < lines.length) {
    const [type, question] = lines[i].split(`:`, 2)

    console.log(`${type}: ${question}`)

    i++

    const activity = {
      type,
      question,
      choices: [],
    }

    while (i < lines.length && lines[i].startsWith(`-`)) {
      const choice = lines[i].substring(1).trim()

      activity.choices.push(choice)

      i++
    }

    script.activities.push(activity)
  }
  return script
}

async function generateFromScript () {
  const text = document.getElementById(`script`).value

  const script = compileScript(text)

  generateKlaxoonSession(script)
}

async function initialize () {
  document.getElementById(`commandGetCourse`).addEventListener(`click`, getCourse)
  document.getElementById(`commandGenerate`).addEventListener(`click`, generateFromCourseId)
  document.getElementById('commandGenerateKlaxGen').addEventListener(`click`, generateFromScript)

  showArticle(`courseSelect`)
}

await initialize()


