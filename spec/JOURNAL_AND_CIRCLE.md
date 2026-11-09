# Between Us · Journal, My Circle, and Open the Door · v2.0

## Purpose
Between Us helps people put thoughts into words and reach someone they trust. It must not act as a therapist, interpret someone's mental state, or replace safe real-life relationships. Journaling and writing are private first; all outreach is optional.

## Role experiences

**Child/teen:** Home, My Journal, My Circle, Messages, Open the Door. Can keep private thoughts, request an additional approved contact, start conversations with verified connections, respond to check-ins, or skip them.

**Parent/guardian:** Home, My Journal, My Circle, Messages, Open the Door. Can privately journal, start an apology or difficult talk, approve age-appropriate contacts, and create scheduled gentle check-ins without nagging or scoring.

## Journal rules
1. Every entry is visible only to its author unless the author intentionally shares a separate message.
2. The journal must never automatically copy entry text into a chat, push notification, or suggestion request.
3. The optional **Open the Door reflection** runs through simple **local topic matching**, suggesting only someone to talk with and how to begin the conversation.
4. No psychological advice, mental-health interpretation, diagnoses, treatment recommendations, or emotional scoring.
5. Suggestions are dismissible and never pressure the user to disclose anything.
6. If writing suggests a recipient could be unsafe, never steer the child to contact that person. Provide alternatives and a visible way to seek human support, even when parental approval is inappropriate.
7. For the demo, all entries exist in browser memory only. A production solution must use strong encryption, access control, clear deletion/export and retention rules.

## My Circle
- Kids can communicate with parents/guardians, siblings, approved friends, teachers and other trusted adults.
- Requested in-app connections require appropriate parent/guardian approval **and** identity checks before contact. Approval alone does not establish safety.
- Blocking/reporting, age controls and mechanisms to report an unsafe adult are mandatory for production.
- Allow preparing words for a face-to-face conversation without requiring any in-app message.
- **Do not require parental approval to access safety information or to seek help from a safe adult if a parent is abusive or unsafe.**

## Open the Door
- Parent can create a recurring invitation and preview how it appears to their child.
- Child can reply with a quick response, type their own message, answer later, or skip entirely.
- No engagement streaks, missed-day punishments, or repeated guilt-oriented notifications.
- A parent can also initiate sensitive conversations, apologize, or share a family change.
- Review the recipient, exact text, and desired type of response before sending.

## Current implementation
- Static interactive demo deployed to GitHub Pages. It simulates all flows locally with fictional family members.
- There is no AI service, backend, persistent storage, real messaging, contact verification, or scheduled push notifications.
- Prototype intentionally avoids third-party font or analytics requests.

## Production checklist
Privacy and safety architecture, data minimization, age assurance, COPPA and other applicable law review, consent mechanisms, encryption and secure retention, robust identity and contact verification, anti-grooming and abuse reporting, emergency/help pathways, qualified child-safety review, accessibility, independent security testing and usability research with families.
