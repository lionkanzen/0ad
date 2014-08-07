function Upgrade() {}

const UPGRADING_PROGRESS_INTERVAL = 250;

Upgrade.prototype.Schema =
	"<oneOrMore>" +
		"<element>" +
			"<anyName />" +
			"<interleave>" +
				"<element name='Entity' a:help='Entity to upgrade to'>" +
					"<text/>" +
				"</element>" +
				"<optional>" +
					"<element name='Icon' a:help='Icon to show in the GUI'>" +
						"<text/>" +
					"</element>" +
				"</optional>" +
				"<optional>" +
					"<element name='Tooltip' a:help='This will be added to the tooltip to help the player choose why to upgrade.'>" +
						"<text/>" +
					"</element>" +
				"</optional>" +
				"<optional>" +
					"<element name='Time' a:help='Time required to upgrade this entity, in milliseconds'>" +
						"<data type='nonNegativeInteger'/>" +
					"</element>" +
				"</optional>" +
				"<optional>" +
					"<element name='Cost' a:help='Resource cost to upgrade this unit'>" +
						"<oneOrMore>" +
							"<choice>" +
								"<element name='food'><data type='nonNegativeInteger'/></element>" +
								"<element name='wood'><data type='nonNegativeInteger'/></element>" +
								"<element name='stone'><data type='nonNegativeInteger'/></element>" +
								"<element name='metal'><data type='nonNegativeInteger'/></element>" +
							"</choice>" +
						"</oneOrMore>" +
					"</element>" +
				"</optional>" +
				"<optional>" +
					"<element name='RequiredTechnology' a:help='Define what technology is required for this upgrade'>" +
						"<choice>" +
							"<text/>" +
							"<empty/>" +
						"</choice>" +
					"</element>" +
				"</optional>" +
				"<optional>" +
					"<element name='CheckPlacementRestrictions' a:help='Upgrading will check for placement restrictions'><empty/></element>" +
				"</optional>" +
			"</interleave>" +
		"</element>" +
	"</oneOrMore>";

Upgrade.prototype.Init = function()
{
	this.upgrading = false;
	this.elapsedTime = 0;
	this.timer = undefined;

	this.upgradeTemplates = {};

	for (var choice in this.template)
	{
		var cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
		var name = this.template[choice].Entity;
		if (cmpIdentity)
			name = name.replace(/\{civ\}/g, cmpIdentity.GetCiv());
		if (name in this.upgradeTemplates)
			warn("Upgrade Component: entity " + this.entity + " has two upgrades to the same entity, only the last will be used.");
		this.upgradeTemplates[name] = choice;
	}
};

// On owner change, abort the upgrade
// This will also deal with the "OnDestroy" case.
Upgrade.prototype.OnOwnershipChanged = function(msg)
{
	this.CancelUpgrade();

	if (msg.to !== -1)
		this.owner = msg.to;
};

Upgrade.prototype.ChangeUpgradedEntityCount = function(amount)
{
	if (!this.IsUpgrading())
		return;
	var cmpTempMan = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
	var template = cmpTempMan.GetTemplate(this.upgrading);
	var category = null;
	if (template.TrainingRestrictions)
		category = template.TrainingRestrictions.Category;
	else if (template.BuildRestrictions)
		category = template.BuildRestrictions.Category;

	var cmpEntityLimits = QueryPlayerIDInterface(this.owner, IID_EntityLimits);
	cmpEntityLimits.ChangeCount(category,amount);
};

Upgrade.prototype.CanUpgradeTo = function(template)
{
	return this.upgradeTemplates[template] !== undefined;
};

Upgrade.prototype.GetUpgrades = function()
{
	var ret = [];

	var cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);

	for each (var choice in this.template)
	{
		var entType = choice.Entity;
		if (cmpIdentity)
			entType = entType.replace(/\{civ\}/g, cmpIdentity.GetCiv());

		var hasCosts = false;
		var cost = {};
		if (choice.Cost)
		{
			hasCosts = true;
			for (var type in choice.Cost)
				cost[type] = ApplyValueModificationsToTemplate("Upgrade/Cost/"+type, +choice.Cost[type], this.owner, entType);
		}
		if (choice.Time)
		{
			hasCosts = true;
			cost["time"] = ApplyValueModificationsToTemplate("Upgrade/Time", +choice.Time/1000.0, this.owner, entType);
		}
		ret.push(
		{
			"entity": entType,
			"icon": choice.Icon || undefined,
			"cost": hasCosts ? cost : undefined,
			"tooltip": choice.Tooltip || undefined,
			"requiredTechnology": "RequiredTechnology" in choice ? choice.RequiredTechnology : null,
		});
	}

	return ret;
};

Upgrade.prototype.CancelTimer = function()
{
	if (this.timer)
	{
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		cmpTimer.CancelTimer(this.timer);
		this.timer = undefined;
	}
};

Upgrade.prototype.IsUpgrading = function()
{
	return this.upgrading !== false;
};

Upgrade.prototype.GetUpgradingTo = function()
{
	return this.upgrading;
};

Upgrade.prototype.WillCheckPlacementRestrictions = function(template)
{
	if (!this.upgradeTemplates[template])
		return undefined;

	return ("CheckPlacementRestrictions" in this.template[this.upgradeTemplates[template]]);
};

Upgrade.prototype.GetRequiredTechnology = function(templateArg)
{
	if (!this.upgradeTemplates[templateArg])
		return undefined;

	var choice = this.upgradeTemplates[templateArg];

	if ("RequiredTechnology" in this.template[choice] && this.template[choice].RequiredTechnology === undefined)
	{
		var cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);
		var template = cmpTemplateManager.GetTemplate(this.template[choice].Entity);
		if (template.Identity.RequiredTechnology)
			return template.Identity.RequiredTechnology;
	}
	else if ("RequiredTechnology" in this.template[choice])
		return this.template[choice].RequiredTechnology;

	return null;
};

Upgrade.prototype.GetResourceCosts = function(template)
{
	if (!this.upgradeTemplates[template])
		return undefined;

	var choice = this.upgradeTemplates[template];
	if (!this.template[choice].Cost)
		return {};

	var costs = {};
	for (var r in this.template[choice].Cost)
	{
		costs[r] = +this.template[choice].Cost[r];
		costs[r] = ApplyValueModificationsToEntity("Upgrade/Cost/"+r, costs[r], this.entity);
	}
	return costs;
};

Upgrade.prototype.Upgrade = function(template)
{
	if (this.IsUpgrading())
		return false;

	if (!this.upgradeTemplates[template])
		return false;

	var cmpPlayer = QueryOwnerInterface(this.entity, IID_Player);

	if (!cmpPlayer.TrySubtractResources(this.GetResourceCosts(template)))
		return false;

	this.upgrading = template;

	// prevent cheating
	this.ChangeUpgradedEntityCount(1);

	if (this.GetUpgradeTime(template) !== 0)
	{
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		this.timer = cmpTimer.SetInterval(this.entity, IID_Upgrade, "UpgradeProgress", 0, UPGRADING_PROGRESS_INTERVAL, {"upgrading": template});
	}
	else
		this.UpgradeProgress();

	return true;
};

Upgrade.prototype.CancelUpgrade = function()
{
	if (this.IsUpgrading() === false)
		return;

	var cmpPlayer = QueryOwnerInterface(this.entity, IID_Player);
	if (cmpPlayer)
	{
		var costs = this.GetResourceCosts(this.upgrading);
		cmpPlayer.AddResources(costs);
	}

	this.ChangeUpgradedEntityCount(-1);

	this.upgrading = false;
	this.CancelTimer();
	this.SetElapsedTime(0);
};

Upgrade.prototype.GetUpgradeTime = function(templateArg)
{
	var template = this.upgrading || templateArg;
	var choice = this.upgradeTemplates[template];
	if (!choice)
		return undefined;
	return this.template[choice].Time ? ApplyValueModificationsToEntity("Upgrade/Time", +this.template[choice].Time, this.entity) : 0;
};

Upgrade.prototype.GetElapsedTime = function()
{
	return this.elapsedTime;
};

Upgrade.prototype.GetProgress = function()
{
	if (!this.IsUpgrading())
		return undefined;
	return this.GetUpgradeTime() == 0 ? 1 : this.elapsedTime / this.GetUpgradeTime();
};

Upgrade.prototype.SetElapsedTime = function(time)
{
	this.elapsedTime = time;
};

Upgrade.prototype.UpgradeProgress = function(data, lateness)
{
	if (this.elapsedTime < this.GetUpgradeTime())
	{
		this.SetElapsedTime(this.GetElapsedTime() + UPGRADING_PROGRESS_INTERVAL + lateness);
		return;
	}

	this.CancelTimer();

	var newEntity = ChangeEntityTemplate(this.entity, this.upgrading);

	if (newEntity)
		PlaySound("upgraded", newEntity);
};

Engine.RegisterComponentType(IID_Upgrade, "Upgrade", Upgrade);
