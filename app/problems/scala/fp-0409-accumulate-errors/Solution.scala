def map2V[E, A, B, C](a: Validated[E, A], b: Validated[E, B])(f: (A, B) => C): Validated[E, C] =
  (a, b) match
    case (Valid(x), Valid(y)) => Valid(f(x, y))
    case (Invalid(e1), Invalid(e2)) => Invalid(e1 ++ e2)
    case (Invalid(e1), _) => Invalid(e1)
    case (_, Invalid(e2)) => Invalid(e2)

def mkPerson(name: String, age: Int): Validated[String, Person] =
  map2V(mkName(name), mkAge(age))(Person(_, _))

def traverseV[E, A, B](xs: List[A])(f: A => Validated[E, B]): Validated[E, List[B]] =
  xs.foldRight(Valid(Nil): Validated[E, List[B]])((a, acc) => map2V(f(a), acc)(_ :: _))
