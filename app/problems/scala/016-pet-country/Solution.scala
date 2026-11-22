def countryOfPet(
    pet: String,
    owners: Map[String, String],
    cities: Map[String, String],
    countries: Map[String, String]
): Option[String] =
  for
    owner <- owners.get(pet)
    city <- cities.get(owner)
    country <- countries.get(city)
  yield country
