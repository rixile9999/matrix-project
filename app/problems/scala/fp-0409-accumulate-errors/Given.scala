enum Validated[+E, +A]:
  case Valid(value: A)
  case Invalid(errors: List[E])

export Validated.{Valid, Invalid}

case class Person(name: String, age: Int)

def mkName(name: String): Validated[String, String] =
  if name == "" then Invalid(List("Name is empty."))
  else Valid(name)

def mkAge(age: Int): Validated[String, Int] =
  if age < 0 then Invalid(List("Age is out of range."))
  else Valid(age)
