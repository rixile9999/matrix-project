case class Person(name: String, age: Int)

def sortPeople(people: List[Person]): List[Person] =
  people.sortBy(p => (p.age, p.name))(using Ordering.Tuple2(Ordering.Int.reverse, Ordering.String))
