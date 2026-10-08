# Welcome Study with Faris

Free study quizzes for UTAS courses: TOT Course (Tourism and Hospitality), Supply Chain, Finance and Management.

- Student and teacher accounts (unique username + password), admin sign-in for the site owner
- One question at a time, with a definition and an explanation after every answer
- Written Q&A practice with model answers
- Percentage score and time (minutes and seconds) for every quiz
- A chat for every course; the admin can close (`#closed`), open (`#open`) and clear (`#del`) it
- Admin dashboard: activity, scores, study time, accounts and password resets
- Works on phones

## Folders

```
public/                 the website (published as it is, nothing to build)
  index.html            page shell: loads the styles and scripts below
  css/
    base.css            colours, fonts, layout, tabs, course home
    quiz.css            quiz card, progress strip, results
    forms.css           question bank, add-question form, written practice
    admin.css           dashboard tables and charts
    layout.css          bottom dock (Next / Save bar) and phone layout
    chat.css            sign-in screen and course chat
  js/                   loaded in this order
    config.js           storage keys and the server address (TRACK_URL)
    utils.js            small helpers
    data.js             loads the question files, shared state, admin's saved edits
    quiz.js             quiz rounds, results, timers, written practice
    editing.js          admin editing: question bank, add/delete, save
    views.js            top bar, course home, bottom dock, navigation
    tracking.js         activity events and study time
    auth.js             sign in, accounts, each person's own progress
    chat.js             course chats and admin commands
    admin.js            admin dashboard
    main.js             event handlers and start-up
  data/
    courses.json        the courses, in order, and their chapter files
    <course>/chapter-N.json   one file per chapter: questions, answers, definitions, explanations
netlify.toml            Netlify settings (publish the public folder)
```

## Adding a chapter

Add a `chapter-N.json` file in the course folder (same format as the others) and list it under that course in `data/courses.json`.

## Server

Accounts, chats, tracking and the admin's edits are stored in a Google Sheet through a Google Apps Script web app (its address is `TRACK_URL` in `js/config.js`). The script itself is kept privately, not in this repository.
