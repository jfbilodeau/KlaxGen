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

async function getCourse () {
  showArticle(`fetchCourse`)

  const courseId = document.getElementById(`fieldCourseId`).value
  const locale = document.getElementById(`fieldLocale`).value

  const response = await fetch(`http://localhost:3000/kc/document?courseId=${courseId}&locale=${locale}&raw=true`)

  if (response.ok) {
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
            element.innerHTML = `<b>${module.title}</b><br><input type="checkbox" id="${unit.id}"> ${unit.title}`

            units.push(element)
          }
        }
      }
    }

    const ul = document.getElementById(`selectModules`)
    ul.replaceChildren(...units)
  } else {
    showArticle(`fetchError`)
    document.getElementById(`labelCourseId`).innerText = courseId
    document.getElementById(`labelLocale`).innerText = locale
  }
}

async function initialize () {
  document.getElementById(`commandGetCourse`).addEventListener(`click`, (e) => {
    getCourse()
  })

  document.getElementById(`commandGenerate`).addEventListener(`click`, async (e) => {
    const sessionTitle = document.getElementById(`fieldSessionTitle`).value
    const units = []

    const checkBoxes = document.querySelectorAll(`#formUnits input[type="checkbox"]`)
    checkBoxes.forEach(e => {
      if (e.checked) {
        const unit = course.units.find(u => u.id === e.id)
        units.push(unit)
      }
    })

    showArticle(`generate`)

    const [tab] = await chrome.tabs.query({ active: true })
    await chrome.tabs.update({ url: `https://enterprise.klaxoon.com/userspace/studio/manager/activities/` })
    await chrome.debugger.attach({ tabId: tab.id }, `1.3`)

    chrome.runtime.onMessage.addListener(async m => {
      switch (m.action) {
        case `execute`:
          const keys = m.keys
          console.log(`Executing: ${keys}`)
          for (const key of keys) {
            console.log(`Sending: ${key}`)
            await chrome.debugger.sendCommand({ tabId: tab.id }, `Input.dispatchKeyEvent`, {
              type: `char`,
              text: key,
            })
          }
          break
      }
    })

    await pause(2000)

    await chrome.tabs.sendMessage(tab.id, {
      action: 'createSession',
      options: {
        title: sessionTitle,
        course,
        units
      }
    })
  })

  showArticle(`courseSelect`)
}

await initialize()


