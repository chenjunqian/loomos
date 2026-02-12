import { Hono } from 'hono'
import { loadSkills, getSkillByName, loadSkillFile, getSkillBundle } from './index'
import { config } from '../config'

export const skillsRoutes = new Hono()

skillsRoutes.get('/skills', async (c) => {
    const skills = await loadSkills(config.skillsPath)
    return c.json(skills.map(skill => ({
        name: skill.metadata.name,
        description: skill.metadata.description,
    })))
})

skillsRoutes.get('/skills/:name', async (c) => {
    const name = c.req.param('name')
    const skill = getSkillByName(name)

    if (!skill) {
        return c.json({ error: 'Skill not found' }, 404)
    }

    return c.json({
        metadata: skill.metadata,
        content: skill.content,
    })
})

skillsRoutes.get('/skills/:name/bundle', async (c) => {
    const name = c.req.param('name')
    const skill = getSkillByName(name)

    if (!skill) {
        return c.json({ error: 'Skill not found' }, 404)
    }

    const bundle = getSkillBundle(skill)
    return c.json(bundle)
})

skillsRoutes.get('/skills/:name/file/*', async (c) => {
    const name = c.req.param('name')
    const filename = c.req.param('*') || ''

    const content = await loadSkillFile(name, filename)

    if (content === null) {
        return c.json({ error: 'File not found' }, 404)
    }

    return c.text(content)
})
