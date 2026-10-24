-- Add a sixth signature. Account assignment is performed privately, never in git.
alter table public.ruby_contributors drop constraint ruby_contributors_brand_check;
alter table public.ruby_contributors drop constraint ruby_contributors_theme_check;
alter table public.ruby_contributors drop constraint ruby_contributors_check;
alter table public.ruby_contributors add constraint ruby_contributors_brand_check
  check(brand in ('OmaticsZone','SoDegenerate','FranksCorner','HoustonMikesHub','The GOAT','MarkKuban','SoloHendrix'));
alter table public.ruby_contributors add constraint ruby_contributors_theme_check
  check(theme in ('orbit','diagonal','corner','skyline','diamond','marquee','encore'));
alter table public.ruby_contributors add constraint ruby_contributors_check
  check((brand,theme) in (('OmaticsZone','orbit'),('SoDegenerate','diagonal'),('FranksCorner','corner'),('HoustonMikesHub','skyline'),('The GOAT','diamond'),('MarkKuban','marquee'),('SoloHendrix','encore')));
